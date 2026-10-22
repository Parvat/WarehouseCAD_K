// TH — the pine theme (THEME.md) and the UI-AUDIT.md broken items B1–B3, B5–B9.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { placeFloat, floatFreeHeight, FLOAT_EDGE } from '../../utils/floatPlace'
import { SELECT_BLUE, selectTint, TEXT_FONTS, textFace } from '../../theme/tokens'
import { placingName } from '../../utils/placingName'
import { HANDLE_ACCENT } from '../../canvas2/handleGeometry'
import { OVERLAY } from '../../render/overlayOps'


const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split('\r\n').join('\n')
const walk = (d) => readdirSync(d).flatMap(n => { const f = join(d, n); return statSync(f).isDirectory() ? (/__test__|_svg_reference/.test(n) ? [] : walk(f)) : [f] })
const SRC = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

describe('TH — type and tokens', () => {
  it('TH-fonts: no Inter, Montserrat, DM Mono / DM Sans or IBM Plex Mono is loaded or drawn with — only the retired-face table maps old saved text to its successor', () => {
    const bad = /Montserrat|\bInter\b|IBM[ +]Plex|DM[ +]Mono|DM Sans/
    const hits = walk(SRC).filter(f => /\.(jsx?|css)$/.test(f) && !/components[\\/]Canvas[\\/]FloorPlan\.jsx$/.test(f))
      .filter(f => bad.test(readFileSync(f, 'utf8'))).map(f => f.slice(SRC.length))
    expect(hits).toEqual([])
    expect(bad.test(read('../index.html'))).toBe(false)
    expect(bad.test(read('../tailwind.config.js'))).toBe(false)
    expect(read('store/useCanvasStore.js')).toMatch(/textSettings: { fontFamily:'Plus Jakarta Sans'/)
    expect(read('../index.html')).toMatch(/family=JetBrains\+Mono:wght@400;500&family=Oswald:wght@500;600;700&family=Plus\+Jakarta\+Sans:wght@400;500;600;700/)
    // a text object saved in a retired face draws in its successor; the font list is the app's three
    expect(TEXT_FONTS).toEqual(['Plus Jakarta Sans', 'Oswald', 'JetBrains Mono'])
    expect(['Montserrat', 'Inter, sans-serif', "'DM Mono'", 'IBM Plex Mono', 'monospace', undefined, 'Comic Sans', 'Oswald', 'JetBrains Mono'].map(textFace))
      .toEqual(['Plus Jakarta Sans', 'Plus Jakarta Sans', 'JetBrains Mono', 'JetBrains Mono', 'JetBrains Mono', 'Plus Jakarta Sans', 'Plus Jakarta Sans', 'Oswald', 'JetBrains Mono'])
    expect(read('canvas2/shapes.jsx')).toMatch(/fontFamily=\{textFace\(obj\.fontFamily\)\}/)
  })

  it('TH-tokens: one token block with THEME.md\'s exact values; no obsidian / studio / blueprint; the app names map onto them; the theme switcher is gone', () => {
    const css = read('index.css')
    expect(/\[data-theme="[a-z]+"\]/.test(css)).toBe(false)
    expect(css.match(/:root, \[data-theme\] \{/g)).toHaveLength(1)
    const a = css.indexOf(':root, [data-theme] {'), block = css.slice(a, css.indexOf('\n}', a))
    const v = (name) => (block.match(new RegExp(`--${name}:([^;]+);`)) || [])[1]?.trim()
    expect({ bg: v('bg'), bg2: v('bg2'), paper: v('paper'), pine: v('pine'), ink: v('ink'), steel: v('steel'), line: v('line'), blue: v('blue'), amber: v('amber'), flag: v('flag') })
      .toEqual({ bg: '#F2F1EC', bg2: '#EAE8E1', paper: '#FFFFFF', pine: '#14392B', ink: '#171A18', steel: '#767C74', line: '#DEDACF', blue: '#1B4FD8', amber: '#D98324', flag: '#A8341C' })
    expect([v('error-bd'), v('error-bg'), v('error-fg'), v('warn-bd'), v('warn-bg'), v('warn-fg'), v('note-bd'), v('note-bg'), v('note-fg')])
      .toEqual(['#A8341C', '#F5E7E3', '#6B2413', '#C07A12', '#F8F0DF', '#6B4A0B', '#1B4FD8', '#E9EEFB', '#1B3A8C'])
    expect([v('font-ui'), v('font-display'), v('font-mono')]).toEqual(["'Plus Jakarta Sans', system-ui, sans-serif", "'Oswald', sans-serif", "'JetBrains Mono', ui-monospace, monospace"])
    expect([v('text'), v('text3'), v('border'), v('surface2'), v('accent'), v('accent-solid'), v('red')]).toEqual(['var(--ink)', 'var(--steel)', 'var(--line)', 'var(--bg2)', 'var(--pine)', 'var(--pine)', 'var(--flag)'])
    // the plan canvas reads these three — unchanged
    expect([v('canvas-bg'), v('grid-major'), v('grid-minor')]).toEqual(['#EDEBE4', 'rgba(20,57,43,0.18)', 'rgba(20,57,43,0.08)'])
    const top = read('components/Toolbar/TopBar.jsx')
    expect(/obsidian|blueprint|label="Theme"/.test(top)).toBe(false)
    // panels select in pine: nothing in the components draws with --blue any more
    const blueUse = walk(SRC).filter(f => /\.jsx$/.test(f)).filter(f => /var\(--blue/.test(readFileSync(f, 'utf8')))
    expect(blueUse).toEqual([])
  })

  it('TH-select: canvas selection and handles are one token, THEME blue — the CSS --select-blue and theme/tokens.js SELECT_BLUE agree', () => {
    const css = read('index.css')
    expect((css.match(/--select-blue:(#[0-9A-F]{6});/) || [])[1]).toBe(SELECT_BLUE)
    expect(SELECT_BLUE).toBe('#1B4FD8')
    expect(selectTint(0.1)).toBe('rgba(27,79,216,0.1)')
    expect([HANDLE_ACCENT, OVERLAY.edge]).toEqual([SELECT_BLUE, SELECT_BLUE])
    expect(read('canvas2/RowGroupPreview.jsx')).toMatch(/export const GROUP = SELECT_BLUE/)
    const shapes = read('canvas2/shapes.jsx'), ov = read('canvas2/Overlays.jsx')
    expect(/#4a9eff|74,158,255/i.test(shapes)).toBe(false)
    expect(/#4a9eff|74,158,255/i.test(ov)).toBe(false)
    expect(shapes.match(/stroke=\{SELECT_BLUE\}/g)).toHaveLength(4)
  })
})

describe('TH — broken items', () => {
  const HUB = { left: 252, top: 596, right: 316, bottom: 628 }, BAR = { left: 0, top: 0, right: 1700, bottom: 56 }

  it('TH-float (B1 B2): a float is drawn inside the viewport and off the top bar and the Hub button; its remembered spot is untouched; the toolbar lays out flat when too tall to stack', () => {
    // 1700×1050: where it asked
    expect(placeFloat(264, 130, 49, 564, 1700, 1050, [BAR, { ...HUB, top: 1006, bottom: 1038 }])).toEqual({ x: 264, y: 130 })
    // 640 high: clamped up off the bottom — and then off the Hub button's column it overlaps, the nearest clear spot
    const p = placeFloat(264, 130, 49, 564, 1700, 640, [BAR, HUB])
    const over = (r) => p.x < r.right && p.x + 49 > r.left && p.y < r.bottom && p.y + 564 > r.top
    expect([over(HUB), over(BAR), p.x >= FLOAT_EDGE, p.x + 49 <= 1700 - FLOAT_EDGE, p.y + 564 <= 640 - FLOAT_EDGE]).toEqual([false, false, true, true, true])
    // a horizontal toolbar (564×49) at 640 sits where it asked
    expect(placeFloat(264, 130, 564, 49, 1700, 640, [BAR, HUB])).toEqual({ x: 264, y: 130 })
    // dragged onto the Hub button: lifted just above it
    expect(placeFloat(240, 1000, 300, 40, 1700, 1050, [BAR, { left: 252, top: 1006, right: 316, bottom: 1038 }], 8)).toEqual({ x: 240, y: 958 })
    // free height in the toolbar's column: 640 - 56 (top bar) - (640 - 596) (Hub) - 2 edges
    expect(floatFreeHeight(264, 49, 640, [BAR, HUB])).toBe(596 - 56 - 16)
    expect(floatFreeHeight(264, 49, 1050, [BAR, { ...HUB, top: 1006, bottom: 1038 }])).toBe(1006 - 56 - 16)
    const ft = read('components/LeftPanel/FloatingToolbar.jsx')
    expect(ft).toMatch(/const FLOAT_Z = 150/)
    expect(ft).toMatch(/zIndex:FLOAT_Z/)
    expect(ft.includes('zIndex:9998')).toBe(false)
    expect(ft).toMatch(/const tooTall = !horizontal && vertH > 0 && vertH > floatFreeHeight\(/)
    // Studio: the top bar and the Hub button are islands now (src/studio/StudioFrame.jsx)
    expect(read('studio/StudioFrame.jsx')).toMatch(/data-island="top-left" style=\{\{ left: 16, top: 16, height: 44/)
    expect(read('studio/StudioFrame.jsx')).toMatch(/<button type="button" title="Back to hub" onClick=\{onHub\}/)
  })

  it('TH-modal-z (B3): every overlay with a backdrop sits above the floats (200+ vs 150)', () => {
    expect(read('components/Project/ProjectSetup.jsx')).toMatch(/back: \{ position: 'fixed', inset: 0, zIndex: 200/)
    expect(read('components/Rules/RulesPanel.jsx')).toMatch(/position: 'fixed', inset: 0, zIndex: 300/)
    expect(read('components/RightPanel/LayoutCheckPanel.jsx')).toMatch(/position: 'fixed', inset: 0, zIndex: 200/)
  })

  it('TH-beam (B5): the Elevations toolbar\'s beam label is the short form and never ellipsed', () => {
    const tab = read('components/Elevations/ElevationsTab.jsx')
    expect(tab).toMatch(/BEAM \{ftInDash\(shownEntry\.beamIn\)\} · \{per\}P\n/)
    const span = tab.slice(tab.indexOf('aria-label="Beam length"'), tab.indexOf('BEAM {ftInDash(shownEntry.beamIn)}'))
    expect(/textOverflow|overflow: 'hidden'/.test(span)).toBe(false)
    expect(span).toMatch(/flex: '1 0 auto'/)
  })

  it('TH-placing (B6): the placing status names what is placed — a zone by its kind', () => {
    expect([placingName([{ type: 'zone_office' }]), placingName([{ type: 'zone_custom' }]), placingName([{ type: 'rack_row' }]),
      placingName([{ type: 'rack_row' }, { type: 'rack_double_row' }]), placingName([{ type: 'text' }]), placingName([{ type: 'text' }, { type: 'rack_row' }])])
      .toEqual(['office', 'custom area', 'row', '2 rows', 'object', '2 objects'])
    const bar = read('canvas2/RowGroupBar.jsx')
    expect(bar).toMatch(/aria-label=\{`Placing \$\{placingName\(placing\.items\)\}`\}/)
    expect(bar.includes('aria-label="Placing row"')).toBe(false)
  })

  it('TH-export-ask (B7): a title, an X, Esc and a click outside close it; THEME overlay', () => {
    const d = read('components/RightPanel/LayoutCheckPanel.jsx')
    const dlg = d.slice(d.indexOf('export function ExportCheckDialog'))
    expect(dlg).toMatch(/id="export-ask-title"[^>]*>Export with errors</)
    expect(dlg).toMatch(/aria-label="Close" title="Close \(Esc\)" onClick=\{close\}/)
    expect(dlg).toMatch(/if \(e\.key === 'Escape'\) \{ e\.stopPropagation\(\); close\(\) \}/)
    expect(dlg).toMatch(/onMouseDown=\{e => \{ if \(e\.target === e\.currentTarget\) close\(\) \}\}/)
    expect(dlg).toMatch(/background: 'var\(--overlay\)'/)
    expect(dlg).toMatch(/background: 'var\(--paper\)', border: '1px solid var\(--line\)', borderRadius: 2/)
  })

  it('TH-menu (B8): the top-bar menu is a menu — roles, focus on open, arrow keys / Home / End', () => {
    const t = read('components/Toolbar/TopBar.jsx')
    // Studio: the menu is the layout menu, opened from the project name in the top-left island
    expect(t).toMatch(/<div role="menu" aria-label="Layout menu" ref=\{menuBox\} onKeyDown=\{onMenuKey\}/)
    expect(read('studio/StudioFrame.jsx')).toMatch(/aria-haspopup="menu" aria-expanded=\{menu\} aria-label="Layout menu"/)
    expect(t).toMatch(/role="menuitem" tabIndex=\{-1\}/)
    expect(t).toMatch(/role: 'menuitemradio', 'aria-checked': !!active/)
    expect(t).toMatch(/role="menuitemcheckbox" aria-checked=\{on\}/)
    expect(t).toMatch(/<div role="group" aria-label=\{label\}/)
    expect(t).toMatch(/\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/)
    expect(t).toMatch(/useEffect\(\(\) => \{ menuItems\(\)\[0\]\?\.focus\(\) \}, \[\]\)/)
  })

  it('TH-export-window (B9): its chrome is PJS, pine primary, white secondary, radius 2, Lucide Printer and X; the drawing is untouched', () => {
    const p = read('export/pdfExport.js')
    expect(/🖨|✕ Close|#f0b429|font-family: Arial/.test(p.slice(p.indexOf('<style>'), p.indexOf('</body>')))).toBe(false)
    expect(p).toMatch(/\.btn-primary \{ background: #14392B; color: #FFFFFF;/)
    expect(p).toMatch(/border-radius: 2px;/)
    expect(p).toMatch(/font-family: 'Plus Jakarta Sans'/)
    expect(p).toMatch(/import \{ Printer, X \} from 'lucide-react'/)
    expect(p).toMatch(/\$\{ICON_PRINTER\}Print \/ Save as PDF/)
    // the drawing keeps its own type: the plan's sheet text in Arial, the zone label a plain sans
    expect(p).toMatch(/font-family="Arial, sans-serif" fill="#111">SCALE \(FEET\)/)
    expect(p).toMatch(/font-family="sans-serif" font-weight="600"/)
  })
})
