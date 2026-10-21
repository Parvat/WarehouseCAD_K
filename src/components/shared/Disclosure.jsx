import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

/* A quiet, inline disclosure for secondary controls.
   SectionHeader is the panel-level divider — full-bleed, bordered, and loud
   enough that nesting one inside a panel body reads as a second panel. This is
   the sub-level: one row that folds a group of rare controls away, so the
   controls that are actually the point of the panel stay visible. Its heading is
   the same Oswald 13 as every fold.

   `defaultOpen` is false by design — the whole reason a group lands in here is
   that it is not the common case. */
export function Disclosure({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderTop:'1px solid var(--line)', paddingTop:8, marginTop:0 }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{
          display:'flex', alignItems:'center', gap:8, width:'100%', height:32,
          padding:0, border:'none', background:'transparent',
          cursor:'pointer', textAlign:'left', fontFamily:'inherit',
        }}>
        <ChevronRight size={16} strokeWidth={1.5} absoluteStrokeWidth style={{
          color:'var(--steel)', flexShrink:0,
          transform: open ? 'rotate(90deg)' : 'none',
          transition:'transform 0.2s',
        }}/>
        <span className="t-head">{title}</span>
      </button>
      {open && (
        <div style={{ display:'flex', flexDirection:'column', gap:8, padding:'8px 0' }}>
          {children}
        </div>
      )}
    </div>
  )
}
