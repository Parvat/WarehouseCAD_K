import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

/* A quiet, inline disclosure for secondary controls.
   SectionHeader is the panel-level divider — full-bleed, bordered, and loud
   enough that nesting one inside a panel body reads as a second panel. This is
   the sub-level: one text row that folds a group of rare controls away, so the
   controls that are actually the point of the panel stay visible.

   `defaultOpen` is false by design — the whole reason a group lands in here is
   that it is not the common case. */
export function Disclosure({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ borderTop:'0.5px solid var(--border)', paddingTop:6, marginTop:2 }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{
          display:'flex', alignItems:'center', gap:6, width:'100%',
          padding:'5px 2px', border:'none', background:'transparent',
          cursor:'pointer', textAlign:'left', fontFamily:'inherit',
        }}>
        <ChevronRight size={11} strokeWidth={1.8} absoluteStrokeWidth style={{
          color:'var(--text3)', flexShrink:0,
          transform: open ? 'rotate(90deg)' : 'none',
          transition:'transform 0.2s',
        }}/>
        <span style={{
          fontFamily:'var(--font-display)', fontSize:10, fontWeight:600,
          letterSpacing:'0.09em', textTransform:'uppercase', color:'var(--text3)',
        }}>{title}</span>
      </button>
      {open && (
        <div style={{ display:'flex', flexDirection:'column', gap:10, padding:'6px 2px 4px' }}>
          {children}
        </div>
      )}
    </div>
  )
}
