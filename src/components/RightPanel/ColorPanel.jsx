import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { PALETTE_COLORS } from '../../constants'
import { SectionHeader } from '../shared/SectionHeader'
import { cn } from '../../utils/cn'

export function ColorPanel() {
  const {
    fillColor, strokeColor, opacity, noFill,
    setFillColor, setStrokeColor, setOpacity, setNoFill,
    applyFillToSelected, applyStrokeToSelected,
    selectedIds, objects,
  } = useCanvasStore()

  const [active, setActive] = useState('fill')
  const color = active === 'fill' ? fillColor : strokeColor
  const hasSelection = selectedIds.length > 0

  /* Popover open/closed is presentation state — component-local, never the store. */
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popRef     = useRef(null)

  /* The popover is portalled out of the panel. SectionHeader animates its body
     with `overflow:hidden`, and the right panel is an `overflow-y:auto` column
     — between them an absolutely-positioned popover is sliced off a few pixels
     below the chip. Portalling is the only way out of both clips.

     Target is the themed div, NOT document.body: every colour in here is a CSS
     variable scoped to that element, so a body portal renders the popover
     fully transparent (see CLAUDE.md). Read in an effect — on first mount the
     themed div is not committed yet. */
  const [portalTarget, setPortalTarget] = useState(null)
  useEffect(() => { setPortalTarget(document.querySelector('[data-theme]')) }, [])

  const [pos, setPos] = useState(null)
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!r) return
      const h = popRef.current?.offsetHeight || 320
      const below = r.bottom + 6
      /* Flip above the chip when the popover would run off the viewport. */
      const top = (below + h > window.innerHeight - 12)
        ? Math.max(12, r.top - 6 - h)
        : below
      setPos({ top, left: r.left, width: r.width })
    }
    place()
    /* The panel scrolls under a fixed-position popover, so follow it. */
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (triggerRef.current?.contains(e.target)) return
      if (popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  /* Text gets its own dedicated fill control in PropertiesPanel, writing
     obj.fill directly. This panel's fill write goes through
     applyFillToSelected, which bakes a GLOBAL opacity into the fill's
     hex-alpha suffix — a second, independent mechanism that would silently
     fight PropertiesPanel's dedicated obj.opacity slider for text. Suppress
     rather than let two fill/opacity paths compete for the same object. */
  const soleSelected = selectedIds.length === 1 ? objects.find(o => o.id === selectedIds[0]) : null
  if (soleSelected?.type === 'text') return null

  const setColor = (c) => {
    if (active === 'fill') {
      setFillColor(c)
      if (hasSelection) applyFillToSelected(c, false)
    } else {
      setStrokeColor(c)
      if (hasSelection) applyStrokeToSelected(c)
    }
  }

  const toggleNoFill = (v) => {
    setNoFill(v)
    if (hasSelection) applyFillToSelected(fillColor, v)
  }

  /* The trigger chip carries both channels at a glance: fill is the body,
     stroke is the ring around it. One control instead of a wall of swatches. */
  const chip = (
    <span style={{
      width:22, height:22, borderRadius:6, flexShrink:0,
      border:`3px solid ${strokeColor}`,
      background: noFill ? 'transparent' : fillColor,
      backgroundImage: noFill
        ? 'repeating-linear-gradient(-45deg,var(--red),var(--red) 2px,transparent 2px,transparent 6px)'
        : undefined,
      boxShadow:'0 0 0 1px var(--border)',
    }}/>
  )

  return (
    <SectionHeader title="Color" defaultOpen={true}>
      <div style={{ padding:'10px 12px 12px', display:'flex', flexDirection:'column', gap:8 }}>

        {hasSelection && (
          <div style={{
            fontSize:9.5, fontFamily:'var(--font-mono)', color:'var(--text3)',
          }}>
            Applies to {selectedIds.length} selected object{selectedIds.length > 1 ? 's' : ''}
          </div>
        )}

        {/* ── The one visible control: a colour chip that opens the picker ── */}
        <div ref={triggerRef}>
          <button onClick={() => setOpen(o => !o)} aria-expanded={open}
            style={{
              display:'flex', alignItems:'center', gap:10, width:'100%',
              padding:'7px 9px', borderRadius:9, cursor:'pointer',
              background:'var(--surface2)', border:'0.5px solid var(--border)',
              fontFamily:'inherit', textAlign:'left',
              transition:'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2)'}>
            {chip}
            <span style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:1 }}>
              <span style={{ fontSize:11.5, fontWeight:500, color:'var(--text)' }}>
                {noFill ? 'Stroke only' : 'Fill & stroke'}
              </span>
              <span style={{
                fontSize:9.5, fontFamily:'var(--font-mono)', color:'var(--text3)',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}>
                {noFill ? (strokeColor || '').toUpperCase() : `${(fillColor || '').toUpperCase()} · ${opacity}%`}
              </span>
            </span>
            <ChevronDown size={13} strokeWidth={1.6} absoluteStrokeWidth
              style={{ color:'var(--text3)', flexShrink:0,
                transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}/>
          </button>

          {/* ── Popover: everything the flat panel used to show at once ── */}
          {open && portalTarget && createPortal(
            <div ref={popRef} style={{
              position:'fixed', zIndex:200,
              top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? 248,
              visibility: pos ? 'visible' : 'hidden',
              background:'var(--surface)', border:'0.5px solid var(--border)',
              borderRadius:11, boxShadow:'var(--shadow)',
              padding:12, display:'flex', flexDirection:'column', gap:11,
            }}>

              {/* Which channel am I editing */}
              <div style={{ display:'flex', gap:2, padding:2, background:'var(--surface2)', borderRadius:8 }}>
                {['fill','stroke'].map(ch => (
                  <button key={ch} onClick={() => setActive(ch)}
                    style={{
                      flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                      padding:'5px 0', borderRadius:6, border:'none', cursor:'pointer',
                      fontFamily:'inherit', fontSize:11, fontWeight:600, textTransform:'capitalize',
                      background: active===ch ? 'var(--surface)' : 'transparent',
                      color:      active===ch ? 'var(--text)'    : 'var(--text3)',
                      boxShadow:  active===ch ? '0 1px 3px rgba(0,0,0,0.07)' : 'none',
                      transition:'background 0.12s, color 0.12s',
                    }}>
                    <span style={{
                      width:11, height:11, borderRadius:3, flexShrink:0,
                      boxShadow:'0 0 0 1px var(--border)',
                      background: ch==='stroke' ? strokeColor : (noFill ? 'transparent' : fillColor),
                      backgroundImage: (ch==='fill' && noFill)
                        ? 'repeating-linear-gradient(-45deg,var(--red),var(--red) 2px,transparent 2px,transparent 5px)'
                        : undefined,
                    }}/>
                    {ch}
                  </button>
                ))}
              </div>

              {/* Hex + native picker */}
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                <input type="text" value={color}
                  onChange={e => setColor(e.target.value)}
                  className="flex-1 min-w-0 bg-[var(--surface2)] border border-[var(--border)] rounded-md text-[11px] text-[var(--text)] font-mono px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]/50" />
                <input type="color" value={color.length === 7 ? color : '#000000'}
                  onChange={e => setColor(e.target.value)}
                  className="w-8 h-8 shrink-0 rounded-md cursor-pointer border border-[var(--border)] p-0.5" />
              </div>

              {/* Palette — the rainbow grid, now behind the chip rather than
                  permanently occupying a third of the panel. */}
              <div className="grid grid-cols-8 gap-1.5">
                {PALETTE_COLORS.map((c, i) => (
                  <button key={i} onClick={() => { setColor(c); if (noFill && active === 'fill') toggleNoFill(false) }}
                    style={{ background: c }}
                    className={cn('aspect-square rounded-[5px] transition-transform hover:scale-110',
                      color === c ? 'scale-110 ring-2 ring-[var(--text)] ring-offset-1 ring-offset-[var(--surface)]' : '')}
                    title={c} />
                ))}
              </div>

              {/* Opacity */}
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                <span style={{ fontSize:11, color:'var(--text2)', width:52, flexShrink:0 }}>Opacity</span>
                <input type="range" min="0" max="100" value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))}
                  style={{ flex:1, accentColor:'var(--accent)', height:4 }} />
                <span style={{ fontSize:10, fontFamily:'var(--font-mono)', color:'var(--text3)', width:30, textAlign:'right' }}>{opacity}%</span>
              </div>

              {/* Transparent fill */}
              <div style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                gap:10, paddingTop:10, borderTop:'0.5px solid var(--border)',
              }}>
                <div style={{ minWidth:0 }}>
                  <p style={{ fontSize:11, color:'var(--text)' }}>Transparent fill</p>
                  <p style={{ fontSize:9.5, color:'var(--text3)', fontFamily:'var(--font-mono)' }}>Stroke only</p>
                </div>
                <button onClick={() => toggleNoFill(!noFill)} role="switch" aria-checked={noFill}
                  aria-label="Transparent fill"
                  className={cn('relative w-9 h-5 rounded-full transition-all shrink-0 border-0 cursor-pointer',
                    noFill ? 'bg-[var(--accent-solid)]' : 'bg-[var(--surface3)]')}>
                  <span className={cn('absolute top-0.5 w-4 h-4 rounded-full transition-all',
                    noFill ? 'left-[18px] bg-[var(--accent-fg)]' : 'left-0.5 bg-[var(--text3)]')} />
                </button>
              </div>

              {/* Quick values */}
              <div style={{ display:'flex', gap:5 }}>
                {[
                  { lbl:'White', on:false, act:() => setColor('#ffffff') },
                  { lbl:'Black', on:false, act:() => setColor('#000000') },
                  { lbl:'None',  on:(noFill && active === 'fill'), act:() => { if (active === 'fill') toggleNoFill(true) } },
                ].map(q => (
                  <button key={q.lbl} onClick={q.act}
                    style={{
                      flex:1, padding:'5px 0', borderRadius:7, cursor:'pointer', border:'none',
                      fontSize:10, fontFamily:'var(--font-mono)', fontWeight:600,
                      background: q.on ? 'var(--accent-solid)' : 'var(--surface2)',
                      color:      q.on ? 'var(--accent-fg)'    : 'var(--text2)',
                      transition:'background 0.12s, color 0.12s',
                    }}>
                    {q.lbl}
                  </button>
                ))}
              </div>

            </div>,
            portalTarget
          )}
        </div>

      </div>
    </SectionHeader>
  )
}
