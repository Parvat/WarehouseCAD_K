import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { PALETTE_COLORS } from '../../constants'
import { SectionHeader } from '../shared/SectionHeader'
import { cn } from '../../utils/cn'

export function ColorPanel() {
  const {
    fillColor, strokeColor, opacity, noFill,
    setFillColor, setStrokeColor, setOpacity, setNoFill,
    applyFillToSelected, applyStrokeToSelected,
    selectedIds, objects,
  } = useCanvasStore(useShallow(s => ({ fillColor: s.fillColor, strokeColor: s.strokeColor, opacity: s.opacity, noFill: s.noFill, setFillColor: s.setFillColor, setStrokeColor: s.setStrokeColor, setOpacity: s.setOpacity, setNoFill: s.setNoFill, applyFillToSelected: s.applyFillToSelected, applyStrokeToSelected: s.applyStrokeToSelected, selectedIds: s.selectedIds, objects: s.objects })))

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
      width:22, height:22, borderRadius:2, flexShrink:0,
      border:`3px solid ${strokeColor}`,
      background: noFill ? 'transparent' : fillColor,
      backgroundImage: noFill
        ? 'repeating-linear-gradient(-45deg,var(--flag),var(--flag) 2px,transparent 2px,transparent 6px)'
        : undefined,
      boxShadow:'0 0 0 1px var(--line)',
    }}/>
  )

  return (
    <SectionHeader title="Color" defaultOpen={true}>
      <div style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:8, minWidth:0 }}>

        {hasSelection && (
          <div style={{
            fontSize:12, fontFamily:'var(--font-ui)', color:'var(--steel)',
          }}>
            Applies to {selectedIds.length} selected object{selectedIds.length > 1 ? 's' : ''}
          </div>
        )}

        {/* ── The one visible control: a colour chip that opens the picker ── */}
        <div ref={triggerRef}>
          <button onClick={() => setOpen(o => !o)} aria-expanded={open}
            style={{
              display:'flex', alignItems:'center', gap:12, width:'100%', minWidth:0,
              padding:'8px', borderRadius:2, cursor:'pointer',
              background:'var(--paper)', border:'1px solid var(--line)',
              fontFamily:'var(--font-ui)', textAlign:'left',
              transition:'background 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--paper)'}>
            {chip}
            <span style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:2 }}>
              <span style={{ fontSize:13, fontWeight:500, color:'var(--ink)' }}>
                {noFill ? 'Stroke only' : 'Fill & stroke'}
              </span>
              <span style={{
                fontSize:11, fontFamily:'var(--font-ui)', color:'var(--steel)',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}>
                {/* a hex code and the percent are figures (mono); a named colour such as TRANSPARENT is a word (PJS) */}
                {noFill
                  ? <span className={/^#/.test(strokeColor || '') ? 't-num' : undefined}>{(strokeColor || '').toUpperCase()}</span>
                  : <><span className={/^#/.test(fillColor || '') ? 't-num' : undefined}>{(fillColor || '').toUpperCase()}</span> · <span className="t-num">{opacity}%</span></>}
              </span>
            </span>
            <ChevronDown size={16} strokeWidth={1.5} absoluteStrokeWidth
              style={{ color:'var(--steel)', flexShrink:0,
                transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}/>
          </button>

          {/* ── Popover: everything the flat panel used to show at once ── */}
          {open && portalTarget && createPortal(
            <div ref={popRef} className="t-float" style={{
              position:'fixed', zIndex:200,
              top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? 248,
              visibility: pos ? 'visible' : 'hidden',
              padding:12, display:'flex', flexDirection:'column', gap:12,
            }}>

              {/* Which channel am I editing */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:4 }}>
                {['fill','stroke'].map(ch => (
                  <button key={ch} onClick={() => setActive(ch)}
                    className={'t-btn t-btn--secondary' + (active===ch ? ' is-on' : '')}
                    style={{ minWidth:0, textTransform:'capitalize' }}>
                    <span style={{
                      width:12, height:12, borderRadius:2, flexShrink:0,
                      boxShadow:'0 0 0 1px var(--line)',
                      background: ch==='stroke' ? strokeColor : (noFill ? 'transparent' : fillColor),
                      backgroundImage: (ch==='fill' && noFill)
                        ? 'repeating-linear-gradient(-45deg,var(--flag),var(--flag) 2px,transparent 2px,transparent 5px)'
                        : undefined,
                    }}/>
                    {ch}
                  </button>
                ))}
              </div>

              {/* Hex + native picker */}
              <div style={{ display:'flex', gap:8, alignItems:'center', minWidth:0 }}>
                <input type="text" value={color}
                  onChange={e => setColor(e.target.value)}
                  className="t-input" style={{ flex:1 }} />
                <input type="color" value={color.length === 7 ? color : '#000000'}
                  onChange={e => setColor(e.target.value)}
                  style={{ width:32, height:32, flexShrink:0, borderRadius:2, cursor:'pointer', border:'1px solid var(--line)', padding:2, background:'var(--paper)' }} />
              </div>

              {/* Palette — the rainbow grid, now behind the chip rather than
                  permanently occupying a third of the panel. */}
              <div className="grid grid-cols-8 gap-1.5">
                {PALETTE_COLORS.map((c, i) => (
                  <button key={i} onClick={() => { setColor(c); if (noFill && active === 'fill') toggleNoFill(false) }}
                    style={{ background: c }}
                    className={cn('aspect-square rounded-[2px] transition-transform hover:scale-110',
                      color === c ? 'scale-110 ring-2 ring-[var(--ink)] ring-offset-1 ring-offset-[var(--paper)]' : '')}
                    title={c} />
                ))}
              </div>

              {/* Opacity */}
              <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                <span style={{ fontFamily:'var(--font-ui)', fontSize:12, fontWeight:500, color:'var(--steel)', width:56, flexShrink:0 }}>Opacity</span>
                <input type="range" min="0" max="100" value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))}
                  style={{ flex:1, minWidth:0, accentColor:'var(--pine)', height:4 }} />
                <span className="t-num" style={{ fontSize:12, color:'var(--ink-2)', width:40, textAlign:'right' }}>{opacity}%</span>
              </div>

              {/* Transparent fill */}
              <div style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                gap:12, paddingTop:12, borderTop:'1px solid var(--line)',
              }}>
                <div style={{ minWidth:0, fontFamily:'var(--font-ui)' }}>
                  <p style={{ margin:0, fontSize:13, color:'var(--ink)' }}>Transparent fill</p>
                  <p style={{ margin:0, fontSize:12, color:'var(--steel)' }}>Stroke only</p>
                </div>
                <button onClick={() => toggleNoFill(!noFill)} role="switch" aria-checked={noFill}
                  aria-label="Transparent fill"
                  className="relative transition-all shrink-0 border-0 cursor-pointer"
                  style={{ width:32, height:18, borderRadius:2, padding:0, background: noFill ? 'var(--pine)' : 'var(--line-2)' }}>
                  <span className="absolute transition-all"
                    style={{ top:2, left: noFill ? 16 : 2, width:14, height:14, borderRadius:2, background:'var(--paper)' }} />
                </button>
              </div>

              {/* Quick values */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:4 }}>
                {[
                  { lbl:'White', on:false, act:() => setColor('#ffffff') },
                  { lbl:'Black', on:false, act:() => setColor('#000000') },
                  { lbl:'None',  on:(noFill && active === 'fill'), act:() => { if (active === 'fill') toggleNoFill(true) } },
                ].map(q => (
                  <button key={q.lbl} onClick={q.act}
                    className={'t-btn t-btn--secondary' + (q.on ? ' is-on' : '')}
                    style={{ minWidth:0 }}>
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
