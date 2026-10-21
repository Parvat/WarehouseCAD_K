import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/* The one modal recipe (THEME.md overlay): the theme backdrop, a white box, a 1px line, radius 2, the theme shadow,
   a title row with an X; Esc and a click outside close it. Project settings, Rules, Export with errors and the
   start screen are all this. The classes live in index.css (.t-backdrop .t-modal …).

   `onClose` null makes it a modal that only its own buttons close (no X, Esc or outside click). `z` lifts it over
   another modal. `portal` renders it into the themed root rather than in place. */
export function Modal({ title, titleId, onClose, width = 480, z = 200, children, footer, label, portal = false, bodyStyle, headExtra }) {
  const box = useRef(null)
  useEffect(() => {
    if (!onClose) return
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const node = (
    <div className="t-backdrop" style={{ zIndex: z }} onMouseDown={e => { if (onClose && e.target === e.currentTarget) onClose() }}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={label || (titleId ? undefined : title)} aria-labelledby={titleId}
        className="t-modal" style={{ width }}>
        {(title || onClose) && (
          <div className="t-modal-head">
            <h2 id={titleId} className="t-modal-title">{title}</h2>
            {headExtra}
            {onClose && (
              <button type="button" className="t-icon" aria-label="Close" title="Close (Esc)" onClick={onClose}>
                <X size={16} strokeWidth={1.5} absoluteStrokeWidth />
              </button>
            )}
          </div>
        )}
        <div className="t-modal-body" style={bodyStyle}>{children}</div>
        {footer && <div className="t-modal-foot">{footer}</div>}
      </div>
    </div>
  )
  if (!portal) return node
  const host = typeof document !== 'undefined' ? (document.querySelector('[data-theme]') || document.body) : null
  return host ? createPortal(node, host) : node
}
