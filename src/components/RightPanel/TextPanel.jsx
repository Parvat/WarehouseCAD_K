import { TEXT_FONTS, textFace } from '../../theme/tokens'
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'

/* Only faces the app actually loads (index.html) plus generics. An unloaded
   family renders as a silent system fallback, which is how every canvas label
   ended up in the wrong face. */

export function TextPanel() {
  const ts = useCanvasStore(s => s.textSettings)
  const setTextSetting = useCanvasStore(s => s.setTextSetting)

  /* a style / align toggle: a secondary at 32 that turns pine when on (.is-on) */
  const StyleBtn = ({ icon: Icon, field, title: t }) => (
    <button
      title={t}
      onClick={() => setTextSetting(field, !ts[field])}
      className={'t-btn t-btn--secondary' + (ts[field] ? ' is-on' : '')}
      style={{ width: 32, padding: 0 }}
    >
      <Icon size={16} strokeWidth={1.5} absoluteStrokeWidth />
    </button>
  )

  const AlignBtn = ({ icon: Icon, align }) => (
    <button
      onClick={() => setTextSetting('align', align)}
      className={'t-btn t-btn--secondary' + (ts.align === align ? ' is-on' : '')}
      style={{ width: 32, padding: 0 }}
    >
      <Icon size={16} strokeWidth={1.5} absoluteStrokeWidth />
    </button>
  )

  return (
    <SectionHeader title="Text" defaultOpen={true}>
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {/* Font */}
        <label className="t-row">
          <span className="t-label">Font</span>
          <select
            value={textFace(ts.fontFamily)}
            onChange={e => setTextSetting('fontFamily', e.target.value)}
            className="t-input t-words"
          >
            {TEXT_FONTS.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>
        {/* Size + style */}
        <div className="t-row">
          <span className="t-label">Size</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <input
              type="number"
              value={ts.fontSize}
              onChange={e => setTextSetting('fontSize', Number(e.target.value))}
              className="t-input"
              style={{ width: 64, textAlign: 'center' }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              <StyleBtn icon={Bold}      field="bold"      title="Bold" />
              <StyleBtn icon={Italic}    field="italic"    title="Italic" />
              <StyleBtn icon={Underline} field="underline" title="Underline" />
            </div>
          </div>
        </div>
        {/* Align */}
        <div className="t-row">
          <span className="t-label">Align</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <AlignBtn icon={AlignLeft}   align="left" />
            <AlignBtn icon={AlignCenter} align="center" />
            <AlignBtn icon={AlignRight}  align="right" />
          </div>
        </div>
        {/* Preview — set in the chosen text face (that is the point of it) */}
        <div
          contentEditable
          suppressContentEditableWarning
          className="italic cursor-text focus:not-italic"
          style={{
            minHeight: 40, padding: 8, borderRadius: 2, border: '1px solid var(--line)', background: 'var(--paper)', color: 'var(--ink-2)',
            fontFamily:     ts.fontFamily,
            fontSize:       ts.fontSize,
            fontWeight:     ts.bold      ? 'bold'      : 'normal',
            fontStyle:      ts.italic    ? 'italic'    : 'normal',
            textDecoration: ts.underline ? 'underline' : 'none',
            textAlign:      ts.align,
            overflowWrap: 'anywhere',
          }}
          onFocus={e  => { if (e.target.textContent === 'Click to add text…') e.target.textContent = '' }}
          onBlur={e   => { if (!e.target.textContent.trim()) e.target.textContent = 'Click to add text…' }}
        >
          Click to add text…
        </div>
      </div>
    </SectionHeader>
  )
}
