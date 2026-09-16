import { useState, useRef, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'

/* The shortcut list the bar used to print inline, at full width, all the time. */
const SHORTCUTS = [
  ['V', 'Select'], ['L', 'Line'], ['C', 'Circle'], ['R', 'Rectangle'],
  ['T', 'Text'], ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Del', 'Delete'],
  ['Ctrl+S', 'Save'], ['Ctrl+G', 'Group'],
]

function ShortcutHelp() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey  = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position:'relative', pointerEvents:'auto', display:'flex' }}>
      <button onClick={() => setOpen(o => !o)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts"
        aria-expanded={open}
        style={{
          display:'flex', alignItems:'center', justifyContent:'center',
          width:20, height:20, borderRadius:5, border:'none', cursor:'pointer',
          background: open ? 'var(--surface3)' : 'transparent',
          color: open ? 'var(--text)' : 'var(--text3)',
          transition:'background 0.12s, color 0.12s',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.color = 'var(--text3)' }}>
        <HelpCircle size={13} strokeWidth={1.6} absoluteStrokeWidth/>
      </button>

      {open && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 10px)', right:0, zIndex:100,
          width:210, padding:'10px 12px 12px',
          background:'var(--surface)', border:'0.5px solid var(--border)',
          borderRadius:11, boxShadow:'var(--shadow)',
        }}>
          <div style={{
            fontFamily:'var(--font-display)', fontSize:10, fontWeight:600,
            letterSpacing:'0.10em', textTransform:'uppercase',
            color:'var(--text3)', marginBottom:9,
          }}>
            Shortcuts
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {SHORTCUTS.map(([key, label]) => (
              <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                <span style={{ fontSize:11.5, color:'var(--text2)', fontFamily:'var(--font-ui)' }}>{label}</span>
                <kbd style={{
                  fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text3)',
                  background:'var(--surface2)', borderRadius:4, padding:'2px 6px',
                  border:'0.5px solid var(--border)', whiteSpace:'nowrap',
                }}>{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function StatusBar() {
  const { cursorX, cursorY, selectedIds, objects, groups, unit, zoom, snapToGrid, snapUnit, setSnapUnit } = useCanvasStore()

  // If selected object belongs to a group, show the full group member count
  const activeGroup = (groups || []).find(g => g.ids.some(id => selectedIds.includes(id)))
  const displayCount = activeGroup ? activeGroup.ids.length : selectedIds.length
  const displayLabel = activeGroup
    ? `Group · ${displayCount} objects`
    : displayCount > 0 ? `${displayCount} selected` : `${objects.length} objects`

  const fmtPos = (v) => {
    const ft   = Math.floor(Math.abs(v))
    const inch = Math.round((Math.abs(v) - ft) * 12)
    return inch > 0 ? `${ft}' ${inch}"` : `${ft}'`
  }

  const t = 'var(--text3)', t2 = 'var(--text2)'
  const fm = 'var(--font-mono)'
  const sep = <div style={{ width:1, height:11, background:'var(--border)' }} />

  return (
    <div style={{
      position:'absolute', bottom:0, left:0, right:0, height:30,
      background:'var(--surface)', borderTop:'0.5px solid var(--border)',
      display:'flex', alignItems:'center', gap:14, padding:'0 16px',
      fontSize:10.5, fontFamily:fm, color:t, zIndex:20,
      pointerEvents:'none', userSelect:'none',
      backdropFilter:'blur(8px)',
    }}>
      {/* The "● Ready" lamp said Ready unconditionally — a green dot spending
          the loudest colour in the bar on a constant. */}

      {/* Coordinates — the one figure that changes on every pointer move, so
          it leads and it is the only thing here at full text weight. */}
      <span style={{ color:t2, letterSpacing:'0.01em' }}>
        {fmtPos(cursorX)} <span style={{ opacity:0.4 }}>,</span> {fmtPos(cursorY)}
      </span>

      {sep}

      <span style={{ color: displayCount > 0 ? t2 : t }}>{displayLabel}</span>

      <div style={{ flex:1 }} />

      {/* Snap — pointer-events-auto */}
      <div style={{ display:'flex', alignItems:'center', gap:5, pointerEvents:'auto' }}>
        <span style={{ color:t, opacity:0.65 }}>Snap</span>
        <div style={{ display:'flex', alignItems:'center', gap:1, padding:1.5,
          background:'var(--surface2)', borderRadius:6 }}>
          {[['ft','1ft'],['in','1in'],['half-in','½in']].map(([val, lbl]) => (
            <button key={val} onClick={() => setSnapUnit(val)}
              style={{
                padding:'2px 7px', borderRadius:5, border:'none', cursor:'pointer',
                fontSize:10, fontFamily:fm, fontWeight:500,
                background: snapUnit===val ? 'var(--accent-solid)' : 'transparent',
                color:      snapUnit===val ? 'var(--accent-fg)'    : t,
                transition:'background 0.12s, color 0.12s',
              }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {sep}

      {/* Zoom stays visible: it is ambient state the user changes constantly by
          scrolling, and its controls now live in the top bar's settings menu. */}
      <span style={{ color:t2, minWidth:34, textAlign:'right' }}>{Math.round(zoom * 100)}%</span>

      {/* Grid on/off left the bar — the grid's own presence on the canvas
          already answers it, and the switch is in the settings menu. */}

      <ShortcutHelp />
    </div>
  )
}
