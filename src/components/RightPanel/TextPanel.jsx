import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { SectionHeader } from '../shared/SectionHeader'
import { cn } from '../../utils/cn'

/* Only faces the app actually loads (index.html) plus generics. An unloaded
   family renders as a silent system fallback, which is how every canvas label
   ended up in the wrong face. */
const FONTS = ['Montserrat', 'Inter', 'JetBrains Mono', 'monospace']

export function TextPanel() {
  const { textSettings: ts, setTextSetting } = useCanvasStore()

  const StyleBtn = ({ icon: Icon, field, title: t }) => (
    <button
      title={t}
      onClick={() => setTextSetting(field, !ts[field])}
      className={cn(
        'w-7 h-7 flex items-center justify-center rounded border text-xs font-bold transition-all',
        ts[field]
          ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]'
          : 'bg-[var(--surface3)] border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)]'
      )}
    >
      <Icon size={12} />
    </button>
  )

  const AlignBtn = ({ icon: Icon, align }) => (
    <button
      onClick={() => setTextSetting('align', align)}
      className={cn(
        'w-7 h-7 flex items-center justify-center rounded border transition-all',
        ts.align === align
          ? 'bg-[var(--accent)]/15 border-[var(--accent)] text-[var(--accent)]'
          : 'bg-[var(--surface3)] border-[var(--border)] text-[var(--text2)] hover:text-[var(--text)]'
      )}
    >
      <Icon size={12} />
    </button>
  )

  return (
    <SectionHeader title="Text" defaultOpen={true}>
      <div className="p-2 flex flex-col gap-2">
        {/* Font */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text3)] w-9 shrink-0 font-mono">Font</span>
          <select
            value={ts.fontFamily}
            onChange={e => setTextSetting('fontFamily', e.target.value)}
            className="flex-1 bg-[var(--surface3)] border border-[var(--border)] rounded text-[11px] text-[var(--text)] px-2 py-1 focus:outline-none focus:border-[var(--accent)]/50"
          >
            {FONTS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        {/* Size + style */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text3)] w-9 shrink-0 font-mono">Size</span>
          <input
            type="number"
            value={ts.fontSize}
            onChange={e => setTextSetting('fontSize', Number(e.target.value))}
            className="w-12 bg-[var(--surface3)] border border-[var(--border)] rounded text-[11px] text-[var(--text)] font-mono px-2 py-1 text-center focus:outline-none focus:border-[var(--accent)]/50"
          />
          <div className="flex gap-1">
            <StyleBtn icon={Bold}      field="bold"      title="Bold" />
            <StyleBtn icon={Italic}    field="italic"    title="Italic" />
            <StyleBtn icon={Underline} field="underline" title="Underline" />
          </div>
        </div>
        {/* Align */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[var(--text3)] w-9 shrink-0 font-mono">Align</span>
          <div className="flex gap-1">
            <AlignBtn icon={AlignLeft}   align="left" />
            <AlignBtn icon={AlignCenter} align="center" />
            <AlignBtn icon={AlignRight}  align="right" />
          </div>
        </div>
        {/* Preview */}
        <div
          contentEditable
          suppressContentEditableWarning
          className="bg-[var(--surface2)] border border-[var(--border)] rounded p-2 min-h-[40px] text-[var(--text2)] italic cursor-text focus:outline-none focus:border-[var(--accent)]/40 focus:not-italic"
          style={{
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
      </div>
    </SectionHeader>
  )
}
