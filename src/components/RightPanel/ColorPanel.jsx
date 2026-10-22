import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { PALETTE_COLORS } from '../../constants'
import { Icon } from '../../studio/Icon'
import { C, MONO, SecLabel, Hint, Seg, Row, Toggle, fieldBox } from '../../studio/cardParts'

/* Fill & stroke — a body for the card's "More" fold. */
export function ColorBody() {
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
  const stripes = w => `repeating-linear-gradient(-45deg,${C.danger},${C.danger} 2px,transparent 2px,transparent ${w}px)`
  const chip = (
    <span style={{
      width:22, height:22, borderRadius:6, flexShrink:0,
      border:`3px solid ${strokeColor}`,
      background: noFill ? 'transparent' : fillColor,
      backgroundImage: noFill ? stripes(6) : undefined,
      boxShadow:`0 0 0 1px ${C.separator}`,
    }}/>
  )

  return (
    <>
      <SecLabel>Color</SecLabel>

      {hasSelection && (
        <Hint>Applies to {selectedIds.length} selected object{selectedIds.length > 1 ? 's' : ''}</Hint>
      )}

      {/* ── The one visible control: a colour chip that opens the picker ── */}
      <div ref={triggerRef} style={{ minWidth:0 }}>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          style={{
            display:'flex', alignItems:'center', gap:10, width:'100%', minWidth:0,
            padding:'7px 10px', borderRadius:6, cursor:'pointer',
            background:C.inset, border:0,
            fontFamily:'inherit', textAlign:'left',
          }}>
          {chip}
          <span style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:1 }}>
            <span style={{ fontSize:13, color:C.text }}>
              {noFill ? 'Stroke only' : 'Fill & stroke'}
            </span>
            <span style={{
              fontSize:12, fontFamily:MONO, color:C.muted,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }}>
              {noFill ? (strokeColor || '').toUpperCase() : `${(fillColor || '').toUpperCase()} · ${opacity}%`}
            </span>
          </span>
          <span style={{ display:'flex', transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>
            <Icon name="Chevron" size={12} color={C.muted} />
          </span>
        </button>

        {/* ── Popover: everything the flat panel used to show at once ── */}
        {open && portalTarget && createPortal(
          <div ref={popRef} style={{
            position:'fixed', zIndex:200,
            top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? 248,
            visibility: pos ? 'visible' : 'hidden',
            background:C.island, border:`1px solid ${C.separator}`,
            borderRadius:8, boxShadow:'0 8px 24px rgba(15,18,16,.18)',
            padding:12, display:'flex', flexDirection:'column', gap:10,
            color:C.text, fontFamily:"'Plus Jakarta Sans', system-ui, sans-serif", fontSize:13,
          }}>

            {/* Which channel am I editing */}
            <Seg value={active} onChange={setActive} options={['fill','stroke'].map(ch => ({
              value: ch,
              label: (
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, textTransform:'capitalize' }}>
                  <span style={{
                    width:11, height:11, borderRadius:3, flexShrink:0,
                    boxShadow:`0 0 0 1px ${C.separator}`,
                    background: ch==='stroke' ? strokeColor : (noFill ? 'transparent' : fillColor),
                    backgroundImage: (ch==='fill' && noFill) ? stripes(5) : undefined,
                  }}/>
                  {ch}
                </span>
              ),
            }))} />

            {/* Hex + native picker */}
            <div style={{ display:'flex', gap:6, alignItems:'center', minWidth:0 }}>
              <input type="text" value={color}
                onChange={e => setColor(e.target.value)}
                className="st-field" style={{ ...fieldBox(), flex:1 }} />
              <input type="color" value={color.length === 7 ? color : '#000000'}
                onChange={e => setColor(e.target.value)}
                style={{ width:30, height:30, flexShrink:0, borderRadius:6, cursor:'pointer', border:0, padding:3, background:C.inset }} />
            </div>

            {/* Palette — the rainbow grid, behind the chip rather than
                permanently occupying a third of the panel. Swatches are data. */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(8, minmax(0, 1fr))', gap:6 }}>
              {PALETTE_COLORS.map((c, i) => (
                <button key={i} type="button" onClick={() => { setColor(c); if (noFill && active === 'fill') toggleNoFill(false) }}
                  title={c}
                  style={{
                    background: c, aspectRatio:'1 / 1', minWidth:0, border:0, padding:0, borderRadius:5, cursor:'pointer',
                    boxShadow: color === c ? `0 0 0 2px ${C.island}, 0 0 0 3px ${C.strong}` : `inset 0 0 0 1px ${C.separator}`,
                  }} />
              ))}
            </div>

            {/* Opacity */}
            <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
              <span style={{ fontSize:12, color:C.muted, width:52, flexShrink:0 }}>Opacity</span>
              <input type="range" min="0" max="100" value={opacity}
                onChange={e => setOpacity(Number(e.target.value))}
                style={{ flex:1, minWidth:0, accentColor:C.accent, height:4 }} />
              <span style={{ fontSize:12, fontFamily:MONO, color:C.strong, width:36, textAlign:'right' }}>{opacity}%</span>
            </div>

            <div style={{ height:1, background:C.divider, margin:'4px 0' }} />

            {/* Transparent fill */}
            <Row label={
              <span style={{ display:'flex', flexDirection:'column', gap:1 }}>
                <span style={{ fontSize:13, color:C.text }}>Transparent fill</span>
                <span style={{ fontSize:12, color:C.muted }}>Stroke only</span>
              </span>
            }>
              <Toggle on={noFill} onClick={() => toggleNoFill(!noFill)} label="Transparent fill" />
            </Row>

            {/* Quick values */}
            <Seg options={[
              { label:'White', on:false, onClick:() => setColor('#ffffff') },
              { label:'Black', on:false, onClick:() => setColor('#000000') },
              { label:'None',  on:(noFill && active === 'fill'), onClick:() => { if (active === 'fill') toggleNoFill(true) } },
            ]} />

          </div>,
          portalTarget
        )}
      </div>
    </>
  )
}

export const ColorPanel = ColorBody
