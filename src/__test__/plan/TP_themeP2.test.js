// TP — theme-p2 (UI-AUDIT.md T3–T15, A2–A9, E2–E3, M1–M8, C2–C12): the chrome is one system. Type only on the scale
// (11 12 13 14 15 16 18 26), weights to 600, one caption tracking (.08em), radii 2 / 4, tokens instead of hex,
// one Note, one Modal, the frame's sizes (top bar 48, panel headers 40, left 240, the right panel 300–560 by its edge,
// bottom row 32).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as M from '../../utils/rightPanel'
const { PANEL_HEAD_H, panelWidth } = M
const mem = new Map()
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split('\r\n').join('\n')

/* every file that draws chrome on screen (the dead LeftPanel files — index.jsx and the pickers only it imported —
   and the protected Canvas/FloorPlan.jsx are not rendered; canvas2's Konva files draw the plan, not chrome) */
export const CHROME = [
  'App.jsx', 'shell/Hub.jsx', 'shell/Login.jsx',
  'components/Toolbar/TopBar.jsx', 'components/Generate/GeneratePanel.jsx',
  'components/LeftPanel/FloatingToolbar.jsx',
  'components/RightPanel/index.jsx', 'components/RightPanel/PropertiesPanel.jsx', 'components/RightPanel/LayoutCheckPanel.jsx',
  'components/RightPanel/ColumnCheckPanel.jsx', 'components/RightPanel/GroupPanel.jsx', 'components/RightPanel/ColorPanel.jsx',
  'components/RightPanel/LayerPanel.jsx', 'components/RightPanel/TextPanel.jsx', 'components/RightPanel/LabelsPanel.jsx',
  'components/RightPanel/FloorPlanPanel.jsx',
  'components/RightPanel/panels/RackRowPanelCore.jsx', 'components/RightPanel/panels/LaneRackPanels.jsx',
  'components/RightPanel/panels/CantileverPanel.jsx', 'components/RightPanel/panels/ColumnGridPanel.jsx',
  'components/RightPanel/panels/AisleLabelSize.jsx', 'components/RightPanel/panels/RackingAreaPanel.jsx',
  'components/Elevations/ElevationsTab.jsx', 'components/Elevations/ElevationLine.jsx',
  'components/Project/ProjectSetup.jsx', 'components/Rules/RulesPanel.jsx',
  'components/shared/Fold.jsx', 'components/shared/SectionHeader.jsx', 'components/shared/Disclosure.jsx',
  'components/shared/Note.jsx', 'components/shared/Modal.jsx', 'components/shared/Tooltip.jsx',
  'canvas2/Canvas2.jsx', 'canvas2/RowGroupBar.jsx', 'canvas2/AreaPrompt.jsx', 'canvas2/ElevationsCanvas.jsx',
]
/* FillTool.jsx: only its DOM bar is chrome (FillOverlay above it draws on the canvas) */
const fillBar = () => { const s = read('canvas2/FillTool.jsx'); return s.slice(s.indexOf('const bar = {')) }
const src = (f) => (f === 'canvas2/FillTool.jsx' ? fillBar() : read(f))
const ALL = [...CHROME, 'canvas2/FillTool.jsx']

/* hex that is not chrome, by file: category identity colours, colour-picker fallbacks, an object's own colour */
const HEX_OK = {
  'components/LeftPanel/FloatingToolbar.jsx': /^#(165c45|f59e0b|6366f1|ef4444|3b82f6|8A8578|7c3aed|0E4433|B87309|4547C4|C42B2B|6B675F|5b21b6|22c55e|888888)$/i,
  'components/RightPanel/PropertiesPanel.jsx': /^#171A18$/i,
  // the colour picker's White / Black quick values and its native-picker fallback — object colours, not chrome
  'components/RightPanel/ColorPanel.jsx': /^#(000000|ffffff)$/i,
  // the zone labels' identity colours (the label's own colour on the plan)
  'components/RightPanel/LabelsPanel.jsx': /^#(4a9eff|22c55e|f0b429|a855f7|ef4444|ec4899|14b8a6)$/i,
}

const SCALE = new Set([11, 12, 13, 14, 15, 16, 18, 26])

describe('TP — type', () => {
  it('TP-scale (T5 T9 T10 T12): every font size in the chrome is on the scale — no half pixels, nothing under 11 or over 26', () => {
    const off = []
    for (const f of ALL) for (const m of src(f).matchAll(/font(?:Size|-size)\s*:\s*'?(\d+(?:\.\d+)?)(?:px)?'?/g)) if (!SCALE.has(Number(m[1]))) off.push(`${f}: ${m[0]}`)
    expect(off).toEqual([])
  })
  it('TP-weight (T9 T10 T11): no UI weight over 600', () => {
    const off = []
    for (const f of ALL) for (const m of src(f).matchAll(/font(?:Weight|-weight)\s*:\s*'?(\d{3}|bold)/g)) if (m[1] === 'bold' || Number(m[1]) > 600) off.push(`${f}: ${m[0]}`)
    expect(off).toEqual([])
  })
  it('TP-tracking (T15): one tracking value — .08em — wherever letters are spaced', () => {
    const off = []
    for (const f of ALL) for (const m of src(f).matchAll(/letterSpacing\s*:\s*'([^']+)'/g)) if (!/^0?\.08em$/.test(m[1])) off.push(`${f}: ${m[0]}`)
    expect(off).toEqual([])
    expect(read('index.css')).toMatch(/\.t-cap \{[^}]*font-size:11px; font-weight:600; letter-spacing:\.08em; text-transform:uppercase/)
    expect(read('index.css')).toMatch(/\.t-head \{ font-family:var\(--font-display\); font-size:13px; font-weight:600; letter-spacing:\.08em/)
  })
  it('TP-scale-var: the interface sizes S / M / L stay on the scale', () => {
    const css = read('index.css')
    for (const m of css.matchAll(/--fs-(?:xs|sm|md|lg|xl):(\d+)px/g)) expect(SCALE.has(Number(m[1]))).toBe(true)
  })
})

describe('TP — colour and shape', () => {
  it('TP-hex (A4 A5 A9): no hardcoded hex in the chrome but the category colours and colour-picker fallbacks; no orange', () => {
    const off = []
    for (const f of ALL) for (const m of src(f).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if (!(HEX_OK[f] && HEX_OK[f].test(m[0]))) off.push(`${f}: ${m[0]}`)
    expect(off).toEqual([])
    const orange = /#(E67E22|D35400|F97316|B85F12)\b/i
    expect(ALL.filter(f => orange.test(src(f)))).toEqual([])
  })
  it('TP-radius (C2 C4 C6): controls radius 2, panels and cards 4 — nothing else (0 inside a segmented box, 1 a switch thumb, 50% a status dot)', () => {
    const off = []
    for (const f of ALL) for (const m of src(f).matchAll(/borderRadius\s*:\s*'?([\d.]+%?)'?/g)) if (!['0', '1', '2', '4', '50%'].includes(m[1])) off.push(`${f}: ${m[0]}`)
    expect(off).toEqual([])
    const css = read('index.css')
    expect(css).toMatch(/input\[type=range\], input\[type=checkbox\], input\[type=radio\] \{ accent-color: var\(--pine\); \}/)
  })
  it('TP-buttons (A8 E2 E3): one primary, one secondary, one danger, one ghost icon; heights 32 36 40 44; disabled is the same style at 45%', () => {
    const css = read('index.css')
    for (const c of ['t-btn--primary', 't-btn--secondary', 't-btn--danger', 't-icon']) expect(css).toContain('.' + c + ' {')
    expect(css).toMatch(/\.t-btn \{[\s\S]*?height:32px;[\s\S]*?border-radius:2px;/)
    expect(css).toMatch(/\.t-btn--36 \{ height:36px; \} \.t-btn--40 \{ height:40px; \} \.t-btn--44 \{ height:44px;/)
    expect(css).toMatch(/\.t-btn:disabled, \.t-icon:disabled, \.t-btn\[aria-disabled="true"\] \{ opacity:\.45; cursor:not-allowed; \}/)
    expect(css).toMatch(/\.t-btn--danger:hover:not\(:disabled\) \{ background:var\(--flag\); color:var\(--paper\);/)
    expect(css).toMatch(/\.t-field > \.t-unit \{[^}]*right:8px;[\s\S]*?color:var\(--steel\)/)
    expect(css).toMatch(/:focus-visible \{\n\s+outline: 2px solid var\(--blue\) !important;/)
    // Check layout stays secondary; the count is a chip
    const top = read('components/Toolbar/TopBar.jsx')
    expect(top).toMatch(/onClick=\{\(\) => runLayoutCheck\(useCanvasStore\)\} className="t-btn t-btn--secondary"/)
    expect(top).toMatch(/data-check-chip=\{errors \? 'error' : 'warning'\}/)
    expect(/color: errors \? C\.danger/.test(top)).toBe(false)
  })
})

describe('TP — the frame', () => {
  it('TP-frame: top bar 48; the left header and the right tabs 40 on one line; left 240 fixed (rail 50); the right panel resizable by its canvas-side edge, below the tabs', () => {
    expect(read('components/Toolbar/TopBar.jsx')).toMatch(/export const TOP_BAR_H = 48/)
    expect(PANEL_HEAD_H).toBe(40)
    const ft = read('components/LeftPanel/FloatingToolbar.jsx')
    expect(ft).toMatch(/const PANEL_W {5}= 240/)
    expect(ft).toMatch(/const RAIL_W {6}= 50/)
    expect(/aria-label="Resize library"|data-resize/.test(ft)).toBe(false)
    const rp = read('components/RightPanel/index.jsx')
    expect(rp).toMatch(/height:PANEL_HEAD_H, borderBottom:'1px solid var\(--line\)'/)
    expect(rp).toMatch(/aria-label="Resize right panel"[\s\S]*?onPointerDown=\{startResize\} onDoubleClick=\{resetPanelWidth\}/)
    expect(rp).toMatch(/position:'absolute', top:PANEL_HEAD_H, bottom:0, left:-7, width:12/)
    expect(rp).toMatch(/transition: drag \? 'none' : 'width/)
    expect(ft).toMatch(/top:0, height:PANEL_HEAD_H,\n\s+borderBottom:'1px solid var\(--panel-border\)'/)
    // the toolbar's docked spot follows the live right-panel width
    expect(ft).toMatch(/const canvasW = window\.innerWidth - W - rightW/)
  })
  it('TP-right-width: Properties 320 and Elevations 440 to start; 300–560; each tab its own width, remembered per browser (never the layout); double-click resets the shown tab', () => {
    const RP = { ...M }
    RP.useRightPanel.setState({ tab: 'properties', propsW: RP.RP_W, elevW: RP.ELEV_W })
    expect([RP.RP_W, RP.ELEV_W, RP.RP_MIN, RP.RP_MAX]).toEqual([320, 440, 300, 560])
    expect([panelWidth({ tab: 'properties', propsW: 320, elevW: 440 }), panelWidth({ tab: 'elevations', propsW: 320, elevW: 440 })]).toEqual([320, 440])
    RP.setPanelWidth(400)
    expect(RP.useRightPanel.getState().propsW).toBe(400)
    RP.setRightPanel({ tab: 'elevations' }); RP.setPanelWidth(9999)
    expect([RP.useRightPanel.getState().elevW, RP.useRightPanel.getState().propsW]).toEqual([560, 400])
    RP.setPanelWidth(10)
    expect(RP.useRightPanel.getState().elevW).toBe(300)
    expect(JSON.parse(localStorage.getItem('trace.rightpanel.v1'))).toEqual({ tab: 'elevations', propsW: 400, elevW: 300 })
    RP.resetPanelWidth()
    expect(RP.useRightPanel.getState().elevW).toBe(440)
    RP.setRightPanel({ tab: 'properties' }); RP.resetPanelWidth()
    expect(RP.useRightPanel.getState().propsW).toBe(320)
    // a drag writes once, on release
    localStorage.removeItem('trace.rightpanel.v1'); RP.setPanelWidth(350, { persist: false })
    expect([RP.useRightPanel.getState().propsW, localStorage.getItem('trace.rightpanel.v1')]).toEqual([350, null])
    expect([RP.clampPanelW(NaN, 440), RP.clampPanelW(299.6), RP.clampPanelW(560.4)]).toEqual([440, 300, 560])
    // nothing about the panel goes into the canvas store
    expect(/useCanvasStore/.test(read('utils/rightPanel.js'))).toBe(false)
  })
  it('TP-elevations: controls on the height scale; row buttons 28 wide; the Apply / New elevation row at the button size (13); the list keeps three rows under any split', () => {
    const t = read('components/Elevations/ElevationsTab.jsx')
    const off = []
    for (const m of t.matchAll(/<(button|select|input)\b[^>]*?style=\{\{([^}]*)\}\}/g)) for (const h of m[2].matchAll(/(?:^|[ ,{])(?:height|minHeight)\s*:\s*'?(\d+)/g)) if (![32, 36, 40, 44].includes(Number(h[1]))) off.push(m[0].slice(0, 80))
    expect(off).toEqual([])
    expect(t.match(/className="t-icon" style=\{\{ width: 28 \}\}/g)).toHaveLength(2)
    expect(/style=\{\{ width: 24 \}\}/.test(t)).toBe(false)
    const foot = t.slice(t.indexOf('disabled={!rowsSelected || !active}'), t.indexOf('New elevation</button>'))
    expect(/fontSize|fontWeight/.test(foot)).toBe(false)
    expect(t).toMatch(/const SECTION_MIN = 276/)
    expect(t).toMatch(/const drawH = Math\.max\(120, Math\.min\(Math\.round\(\(bodyH - HANDLE\) \* split\), bodyH - HANDLE - secMin\)\)/)
    // section 02's floor is measured: everything but the list, plus three rows
    expect(t).toMatch(/const LIST_MIN = 3 \* 36 \+ 2 \* 4/)
    expect(t).toMatch(/const need = Math\.round\(sec\.offsetHeight - list\.clientHeight \+ LIST_MIN\)/)
    // segments are full 32px buttons sharing their lines
    expect(t).toMatch(/const seg = \(\) => \(\{ flex: 1, height: 32, marginLeft: -1/)
  })
  it('TP-generate (S5): Generate is in the top bar, left of Check layout, the same 32px secondary; Esc and a click outside close its panel', () => {
    const top = read('components/Toolbar/TopBar.jsx')
    expect(top.indexOf('<GeneratePanel />')).toBeGreaterThan(0)
    expect(top.indexOf('<GeneratePanel />')).toBeLessThan(top.indexOf('<CheckLayoutButton />'))
    expect(/<GeneratePanel/.test(read('App.jsx'))).toBe(false)
    const g = read('components/Generate/GeneratePanel.jsx')
    expect(g).toMatch(/title="Describe the building and generate a layout" className="t-btn t-btn--secondary"/)
    expect(g).toMatch(/const onKey = \(e\) => \{ if \(e\.key === 'Escape' && !document\.querySelector\('\.t-backdrop'\)\) setOpen\(false\) \}/)
    expect(g).toMatch(/if \(wrapRef\.current\?\.contains\(e\.target\)\) return/)
  })
  it('TP-bottom-row: Hub, the Elevations chip, the notices and the corner buttons share one row 12px from the bottom, 32px high; the aisle-label toggle is a corner button, the Properties pill is gone (M2)', () => {
    const c2 = read('canvas2/Canvas2.jsx')
    expect(c2).toMatch(/export const BOTTOM_ROW = \{ inset: 12, h: 32, gap: 8 \}/)
    expect(c2).toMatch(/gridTemplateColumns: 'minmax\(max-content, 1fr\) minmax\(0, auto\) minmax\(max-content, 1fr\)'/)
    const row = c2.slice(c2.indexOf('data-bottom-row'), c2.indexOf('{size.w > 0'))
    expect(['{hubButton}', '<ElevLegend />', '<AreaPrompt />', '<RowGroupBar />', 'aria-label="Measure"', 'aria-label="Aisle labels"', 'aria-label="Fit to content"'].every(k => row.includes(k))).toBe(true)
    expect(row).toMatch(/onClick=\{toggleAisles\}/)
    expect(read('App.jsx')).toMatch(/<Canvas2 hubButton=\{/)
    expect(/Aisle labels visible|toggleAisles/.test(read('components/RightPanel/PropertiesPanel.jsx'))).toBe(false)
    expect(read('canvas2/ElevationsCanvas.jsx')).toMatch(/className="t-float" style=\{\{\n\s+position: 'relative', height: 32/)
  })
  it('TP-toolbar: the drawing toolbar docks at the top centre of the canvas, 12px under the ruler, laid out flat; still dragged by its grip; Reset position in its menu', () => {
    const ft = read('components/LeftPanel/FloatingToolbar.jsx')
    expect(ft).toMatch(/return \{ x: Math\.round\(W \+ Math\.max\(8, \(canvasW - w\) \/ 2\)\), y: 48 \+ \(showRulers \? 20 : 0\) \+ 12 \}/)
    expect(ft).toMatch(/useState\(prefs0\.toolbarHoriz {2}\?\? true\)/)
    expect(ft).toMatch(/menuItem\('Reset position', LocateFixed, onReset/)
    expect(ft).toMatch(/onReset=\{\(\) => setToolbarPos\(null\)\}/)
    expect(ft).toMatch(/borderRadius:4, boxShadow:'var\(--shadow-pop\)'/)
  })
})

describe('TP — white frame', () => {
  it('TP-paper: the top bar, the left panel and the right panel are paper; the canvas and its rulers stay the warm ground', () => {
    const css = read('index.css')
    expect(css).toMatch(/--surface:var\(--paper\);/)
    expect(css).toMatch(/--panel-bg:var\(--paper\);/)
    expect(css).toMatch(/--canvas-bg:#EDEBE4; --ruler-bg:#ECEAE1;/)
    expect(read('canvas2/Rulers.jsx')).toMatch(/background: 'var\(--ruler-bg\)'/)
    expect(read('components/Toolbar/TopBar.jsx')).toMatch(/height:TOP_BAR_H, background:'var\(--surface\)', borderBottom:'1px solid var\(--line\)'/)
    expect(read('components/RightPanel/index.jsx')).toMatch(/background:'var\(--surface\)', borderLeft:'1px solid var\(--line\)'/)
    expect(read('components/LeftPanel/FloatingToolbar.jsx')).toMatch(/background:'var\(--panel-bg\)', borderRight:'1px solid var\(--panel-border\)'/)
  })
  it('TP-fields: inputs, selects and search fill bg2 with a 1px line and turn white with focus; segments and toggles bg2, pine when on; a plain secondary stays white; the tabs bg2 / pine', () => {
    const css = read('index.css')
    expect(css).toMatch(/\.t-input \{[\s\S]*?border:1px solid var\(--line\);\s*background:var\(--bg2\);/)
    expect(css).toMatch(/\.t-input:focus, \.t-field:focus-within > \.t-input \{ background:var\(--paper\); \}/)
    expect(css).toMatch(/select \{ background: var\(--bg2\) !important;[^\n]*\nselect:focus \{ background: var\(--paper\) !important; \}/)
    expect(css).toMatch(/\.t-btn--secondary \{ background:var\(--paper\); color:var\(--ink\); border-color:var\(--line\); \}/)
    expect(css).toMatch(/\.t-btn--secondary\[aria-pressed="false"\], \.t-btn--secondary\[aria-checked="false"\], \.t-seg \{ background:var\(--bg2\); \}/)
    // every is-on toggle is a segment
    for (const f of ALL) { const s = src(f); for (const m of s.matchAll(/'t-btn t-btn--secondary([^']*)' \+ \(/g)) expect([f, m[1].includes('t-seg')]).toEqual([f, true]) }
    expect(read('components/RightPanel/index.jsx')).toMatch(/background: on \? 'var\(--pine\)' : 'var\(--bg2\)', cursor: 'pointer',/)
    expect(read('components/LeftPanel/FloatingToolbar.jsx')).toMatch(/placeholder="Search" aria-label="Search library"\n\s+className="t-input t-words"/)
  })
  it('TP-no-cards: inside the panels the figures are plain sections — a 1px line, no fill, no box', () => {
    const files = ['components/RightPanel/PropertiesPanel.jsx', 'components/RightPanel/ColumnCheckPanel.jsx', 'components/RightPanel/panels/RackRowPanelCore.jsx',
      'components/RightPanel/panels/LaneRackPanels.jsx', 'components/RightPanel/panels/CantileverPanel.jsx', 'components/RightPanel/panels/ColumnGridPanel.jsx',
      'components/Elevations/ElevationsTab.jsx', 'components/Generate/GeneratePanel.jsx']
    const card = /(borderRadius: ?(4|CARD_R)[^}\n]*background: ?'var\(--(paper|bg)\)'[^}\n]*border: ?'1px solid)|(background: ?'var\(--(paper|bg)\)'[^}\n]*border: ?'1px solid var\(--line\)'[^}\n]*borderRadius: ?4)|(borderRadius:4, padding:'12px 12px',\s*background:'var\(--paper\)')/
    expect(files.filter(f => card.test(read(f)))).toEqual([])
    const pp = read('components/RightPanel/PropertiesPanel.jsx')
    expect(pp).toMatch(/Total — a plain section[^\n]*\n\s+<div style=\{\{ borderTop:'1px solid var\(--line\)', paddingTop:12 \}\}>/)
    expect(pp).toMatch(/Breakdown — a plain section[^\n]*\n\s+<div style=\{\{ borderTop:'1px solid var\(--line\)', paddingTop:12 \}\}>/)
  })
})

describe('TP — overlays and messages', () => {
  it('TP-modal: one recipe — THEME backdrop, white box, 1px line, radius 2, THEME shadow, a title row with an X; Esc and a click outside close it', () => {
    const css = read('index.css')
    expect(css).toMatch(/\.t-backdrop \{ position:fixed; inset:0; z-index:200; background:var\(--overlay\);/)
    expect(css).toMatch(/\.t-modal \{[\s\S]*?background:var\(--paper\); border:1px solid var\(--line\); border-radius:2px; box-shadow:var\(--shadow-pop\);/)
    const m = read('components/shared/Modal.jsx')
    expect(m).toMatch(/if \(e\.key === 'Escape'\) \{ e\.stopPropagation\(\); onClose\(\) \}/)
    expect(m).toMatch(/onMouseDown=\{e => \{ if \(onClose && e\.target === e\.currentTarget\) onClose\(\) \}\}/)
    expect(m).toMatch(/aria-label="Close" title="Close \(Esc\)" onClick=\{onClose\}/)
    expect(css).toMatch(/\.t-float \{ background:var\(--paper\); border:1px solid var\(--line\); border-radius:4px; box-shadow:var\(--shadow-pop\);/)
  })
  it('TP-note (M1 M3 M5): one Note — error, warning, note — from the THEME box tokens; Check layout, the overlap count and Generate use it', () => {
    const n = read('components/shared/Note.jsx')
    expect(n).toMatch(/error: {3}\{ bd: 'var\(--error-bd\)', bg: 'var\(--error-bg\)', fg: 'var\(--error-fg\)' \}/)
    expect(n).toMatch(/warning: \{ bd: 'var\(--warn-bd\)', {2}bg: 'var\(--warn-bg\)', {2}fg: 'var\(--warn-fg\)' \}/)
    expect(n).toMatch(/borderLeft: `3px solid \$\{c\.bd\}`/)
    const lc = read('components/RightPanel/LayoutCheckPanel.jsx')
    expect(lc).toMatch(/<Group label="Errors" items=\{result\.errors\} level="error"/)
    expect(lc).toMatch(/<Group label="Warnings" items=\{result\.warnings\} level="warning"/)
    expect(read('components/RightPanel/PropertiesPanel.jsx')).toMatch(/<Note level="warning" data-testid="capacity-overlap"/)
    expect(read('components/Generate/GeneratePanel.jsx')).toMatch(/<Note level="note" aria-label="From Project setup">/)
  })
})
