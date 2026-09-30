import { X, OctagonAlert, TriangleAlert } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useLayoutCheck, goToIssue, exportAnyway, showIssues } from '../../utils/layoutCheck'
import { getCanvasContainerSize } from '../../utils/canvasContainer'

/* "Check layout" (utils/layoutCheck.js): the last check's problems, grouped
   ERRORS / WARNINGS. Clicking one selects its object(s) and zooms to the spot.
   It only reports; the top bar's button runs it again. */

const head = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 13px 6px' }
const title = { fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)' }
const group = (color) => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px 4px', fontSize: 11, fontWeight: 600, color, letterSpacing: '0.04em' })
const itemBtn = {
  display: 'block', width: '100%', textAlign: 'left', padding: '6px 13px 6px 31px', border: 'none', background: 'transparent',
  cursor: 'pointer', fontSize: 12, lineHeight: 1.35, color: 'var(--text)', fontFamily: 'var(--font-ui)',
}

function Group({ label, items, color, Icon }) {
  if (!items.length) return null
  return (
    <div role="group" aria-label={label}>
      <div style={group(color)}><Icon size={13} strokeWidth={1.5} absoluteStrokeWidth />{label} ({items.length})</div>
      {items.map((it, i) => (
        <button key={it.kind + i} type="button" style={itemBtn} aria-label={it.text} title="Show it on the drawing"
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          onClick={() => goToIssue(useCanvasStore, it, getCanvasContainerSize())}>
          {it.text}
        </button>
      ))}
    </div>
  )
}

export function LayoutCheckPanel() {
  const result = useLayoutCheck(s => s.result)
  const open = useLayoutCheck(s => s.open)
  const close = useLayoutCheck(s => s.close)
  if (!open || !result) return null
  const none = !result.errors.length && !result.warnings.length
  return (
    <div aria-label="Layout check" style={{ borderBottom: '0.5px solid var(--border)', paddingBottom: 8 }}>
      <div style={head}>
        <span style={title}>Layout check</span>
        <button type="button" aria-label="Close layout check" onClick={close}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex' }}>
          <X size={14} strokeWidth={1.5} absoluteStrokeWidth />
        </button>
      </div>
      {none && <div style={{ padding: '4px 13px 6px', fontSize: 12, color: 'var(--text2)' }}>No issues found.</div>}
      <Group label="Errors" items={result.errors} color="var(--red, #C0392B)" Icon={OctagonAlert} />
      <Group label="Warnings" items={result.warnings} color="var(--amber, #B87309)" Icon={TriangleAlert} />
    </div>
  )
}

/* PDF export with errors: asked, never blocked. */
export function ExportCheckDialog({ onExport }) {
  const ask = useLayoutCheck(s => s.askExport)
  if (!ask) return null
  const n = ask.errors
  return (
    <div role="alertdialog" aria-label="Export anyway?" style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px', boxShadow: '0 8px 30px rgba(0,0,0,0.2)', maxWidth: 360, fontFamily: 'var(--font-ui)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{n} error{n === 1 ? '' : 's'} found. Export anyway?</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={showIssues}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Show issues
          </button>
          <button type="button" onClick={() => exportAnyway(onExport)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--accent-solid)', background: 'var(--accent-solid)', color: 'var(--accent-fg)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Export anyway
          </button>
        </div>
      </div>
    </div>
  )
}
