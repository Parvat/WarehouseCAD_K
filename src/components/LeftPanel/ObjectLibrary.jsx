import { useState } from 'react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { OBJECT_LIBRARY } from '../../constants'
import { SectionHeader } from '../shared/SectionHeader'
import { objectContains } from '../../utils/canvas'

const FP_TYPES_SET = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])

export function ObjectLibrary() {
  const { addObject, activeLayerId, objects, zoom, panX, panY } = useCanvasStore()
  const [search, setSearch] = useState('')

  const place = (item) => {
    // Drop at center of visible viewport
    const el  = document.getElementById('canvas-container')
    const cw  = el ? el.clientWidth  : 900
    const ch  = el ? el.clientHeight : 600
    const wx  = (cw / 2 - panX) / zoom
    const wy  = (ch / 2 - panY) / zoom
    const w   = item.w * 40
    const h   = item.h * 40
    const x   = wx - w / 2
    const y   = wy - h / 2

    // Auto-attach only if the drop point (viewport center) is inside an fp
    const parentFp = [...objects].reverse().find(o => FP_TYPES_SET.has(o.type) && objectContains(o, wx, wy))

    addObject({
      type:    'rect',
      x, y, width: w, height: h,
      fill:    item.color + '33',
      stroke:  item.color,
      label:   item.label,
      layerId: activeLayerId,
      ...(parentFp ? { parentId: parentFp.id } : {}),
    })
  }

  return (
    <SectionHeader title="Object Library" defaultOpen={true}>
      <div className="px-2 pt-2">
        <input
          type="text"
          placeholder="Search objects..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[var(--surface3)] border border-[var(--border)] rounded " style={{fontSize:"var(--fs-sm)",color:"var(--text)"}} className=" font-mono px-2 py-1.5 focus:outline-none focus:border-[var(--accent)]/50 placeholder:text-[var(--text3)]"
        />
      </div>
      <div className="p-2">
        {Object.entries(OBJECT_LIBRARY).map(([cat, items]) => {
          const filtered = items.filter(i => !search || i.label.toLowerCase().includes(search.toLowerCase()))
          if (!filtered.length) return null
          return (
            <div key={cat} className="mb-3">
              <span className="block text-[var(--fs-xs)] font-mono uppercase tracking-wider text-[var(--text3)] px-1 mb-1.5">{cat}</span>
              <div className="grid grid-cols-2 gap-1">
                {filtered.map(item => (
                  <button
                    key={item.id}
                    onClick={() => place(item)}
                    title={`${item.label} — ${item.w}×${item.h} ft`}
                    className="flex flex-col items-center gap-1 p-2 rounded-md border" style={{border:"1px solid var(--border)", background:"var(--surface2)"}} className=" hover:border-[var(--purple)]/50 hover:bg-[var(--surface3)] transition-all duration-150 cursor-pointer"
                  >
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke={item.color} strokeWidth="1.3">
                      <rect x="2" y="2" width="18" height="18" rx="2" fill={item.color + '22'} />
                      <line x1="2" y1="11" x2="20" y2="11" strokeOpacity="0.5" />
                    </svg>
                    <span className="font-mono" style={{fontSize:"var(--fs-xs)",color:"var(--text2)"}} className=" text-center leading-tight">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </SectionHeader>
  )
}