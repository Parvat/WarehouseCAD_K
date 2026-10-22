import { TEXT_FONTS, textFace } from '../../theme/tokens'
import { useCanvasStore } from '../../store/useCanvasStore'
import { C, SecLabel, Field, Grid2, SelectField, Seg, fieldBox } from '../../studio/cardParts'

/* Only faces the app actually loads (index.html) plus generics. An unloaded
   family renders as a silent system fallback, which is how every canvas label
   ended up in the wrong face. Text defaults — a body for the card's "More" fold. */

/* a label over a group of buttons: a div, not a <label> (a label would click its first button) */
const Labeled = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
    <span style={{ color: C.muted, fontSize: 12 }}>{label}</span>
    {children}
  </div>
)

export function TextBody() {
  const ts = useCanvasStore(s => s.textSettings)
  const setTextSetting = useCanvasStore(s => s.setTextSetting)

  const style = (field, title, label, look) => ({
    value: field, title, on: !!ts[field], onClick: () => setTextSetting(field, !ts[field]),
    label: <span style={look}>{label}</span>,
  })

  return (
    <>
      <SecLabel>Text</SecLabel>
      <Field label="Font">
        <SelectField words value={textFace(ts.fontFamily)} onChange={e => setTextSetting('fontFamily', e.target.value)}>
          {TEXT_FONTS.map(f => <option key={f}>{f}</option>)}
        </SelectField>
      </Field>
      <Grid2>
        <Field label="Size">
          <input
            type="number"
            value={ts.fontSize}
            onChange={e => setTextSetting('fontSize', Number(e.target.value))}
            className="st-field"
            style={fieldBox()}
          />
        </Field>
        <Labeled label="Style">
          <Seg options={[
            style('bold',      'Bold',      'B', { fontWeight: 600 }),
            style('italic',    'Italic',    'I', { fontStyle: 'italic' }),
            style('underline', 'Underline', 'U', { textDecoration: 'underline' }),
          ]} />
        </Labeled>
      </Grid2>
      <Labeled label="Align">
        <Seg value={ts.align} onChange={v => setTextSetting('align', v)} options={[
          { value: 'left',   label: 'Left' },
          { value: 'center', label: 'Centre' },
          { value: 'right',  label: 'Right' },
        ]} />
      </Labeled>
      {/* Preview — the face, size and style are the text's own (data) */}
      <div
        contentEditable
        suppressContentEditableWarning
        style={{
          minHeight: 40, padding: '8px 10px', borderRadius: 6, background: C.inset, color: C.text,
          outline: 'none', cursor: 'text', overflowWrap: 'anywhere', minWidth: 0,
          fontFamily:     ts.fontFamily,
          fontSize:       ts.fontSize,
          fontWeight:     ts.bold      ? 'bold'      : 'normal',
          fontStyle:      ts.italic    ? 'italic'    : 'normal',
          textDecoration: ts.underline ? 'underline' : 'none',
          textAlign:      ts.align,
        }}
        onFocus={e  => { if (e.target.textContent === 'Click to add text…') e.target.textContent = '' }}
        onBlur={e   => { if (!e.target.textContent.trim()) e.target.textContent = 'Click to add text…' }}
      >
        Click to add text…
      </div>
    </>
  )
}

export const TextPanel = TextBody
