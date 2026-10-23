// SC — the Studio right card, step 2a (STUDIO.md §3, §5; design/studio/Studio.dc.html C1 props, C5 check, C6 zone,
// C7 empty): one set of parts, the four states built from the mockup's values, every other section in the same parts
// under "More", no Lucide anywhere in the card.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Toggle, Tag, CountChip, Totals, BigFigure, Head, Note } from '../../studio/cardParts'
import { ftIn } from '../../studio/cards'
import { rackPositionsLost, usableCapacity } from '../../generate/usableCapacity'

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8').split('\r\n').join('\n')
const html = (el) => renderToStaticMarkup(el)

const CARD = ['studio/cards.jsx', 'studio/cardParts.jsx', 'components/RightPanel/PropertiesPanel.jsx', 'components/RightPanel/ColumnCheckPanel.jsx',
  'components/RightPanel/GroupPanel.jsx', 'components/RightPanel/ColorPanel.jsx', 'components/RightPanel/LayerPanel.jsx', 'components/RightPanel/TextPanel.jsx',
  'components/RightPanel/LabelsPanel.jsx', 'components/RightPanel/panels/RackRowPanelCore.jsx', 'components/RightPanel/panels/CantileverPanel.jsx',
  'components/RightPanel/panels/ColumnGridPanel.jsx', 'components/RightPanel/panels/LaneRackPanels.jsx', 'components/RightPanel/panels/AisleLabelSize.jsx',
  'components/RightPanel/panels/RackingAreaPanel.jsx', 'components/RightPanel/index.jsx', 'components/Elevations/ElevationsTab.jsx',
  'components/Elevations/ElevationDrawing.jsx', 'components/Generate/GeneratePanel.jsx']

describe('SC — parts', () => {
  it('SC-values: the head, the big figure, the field, the toggle, the tag, the count chip and the totals carry the mockup\'s values', () => {
    const p = read('studio/cardParts.jsx')
    expect(p).toMatch(/padding: '8px 16px 14px', display: 'flex', flexDirection: 'column', gap: 4/)          // C1 head
    expect(p).toMatch(/padding: '12px 16px', display: 'flex', flexDirection: 'column', gap/)                  // a block
    expect(p).toMatch(/height: 30, width: '100%', minWidth: 0, display: 'flex', alignItems: 'center', padding: '0 10px', border: 0, borderRadius: 6,/)
    expect(p).toMatch(/background: C\.inset, color: C\.strong/)
    expect(p).toMatch(/gridTemplateColumns: 'repeat\(2, minmax\(0, 1fr\)\)', gap: 10/)
    expect(html(createElement(BigFigure, { value: '216', unit: 'positions', right: '216 usable' }))).toMatch(/font-size:24px;font-weight:500;color:#F2F4F1">216<\/span>.*color:#9AA29C">positions<\/span>.*color:#7BD3A4">216 usable/)
    const on = html(createElement(Toggle, { on: true })), off = html(createElement(Toggle, { on: false }))
    expect(on).toMatch(/width:30px;height:18px;border-radius:9px.*background:#7BD3A4/)
    expect(on).toMatch(/right:2px;width:14px;height:14px;border-radius:7px;background:#0F2A1F/)
    expect(off).toMatch(/background:#3A403C/)
    expect(off).toMatch(/left:2px;width:14px;height:14px;border-radius:7px;background:#C9CEC9/)
    expect(html(createElement(Tag, { level: 'error' }))).toMatch(/height:18px;padding:0 6px;.*border-radius:4px;background:#4A231B;color:#FFB4A3;font-size:11px;font-weight:600;flex-shrink:0">Error</)
    expect(html(createElement(CountChip, { level: 'warning', n: 2 }))).toMatch(/height:20px;padding:0 7px;.*border-radius:10px;background:#3A2E17;color:#F2C77A;.*font-size:11px">2</)
    expect(html(createElement(Totals, { items: [{ label: 'usable', value: '3,642', accent: true }] }))).toMatch(/font-size:15px;color:#7BD3A4">3,642<\/span><span style="color:#9AA29C;font-size:12px">usable/)
    expect(html(createElement(Note, { level: 'note', children: 'x' }))).toMatch(/padding:8px 10px;border-radius:6px;background:#1E2E4A;color:#A9C4FF;font-size:12px/)
    expect(html(createElement(Head, { caption: 'Zone · Office' }))).toMatch(/border-bottom:1px solid #2E3431/)
    // being edited = a 1px select border; selects / inputs in the card leave the old light rules
    expect(read('studio/studio.css')).toMatch(/\.st-field:focus, \.st-field:focus-visible \{ outline:none !important; box-shadow:inset 0 0 0 1px #2E7D5B; \}/)
  })
  it('SC-format: lengths read as the mockups write them — 8′ 0″, 40′ 0″, 6″', () => {
    expect([ftIn(96), ftIn(42), ftIn(480), ftIn(102), ftIn(6)]).toEqual(['8′ 0″', '3′ 6″', '40′ 0″', '8′ 6″', '6″'])
  })
})

describe('SC — the states', () => {
  it('SC-C1: a rack — "Double deep · row N", positions and usable, Bays · Beam · Depth · Flue, the elevation chip, the two switches, the Layout totals', () => {
    const c = read('studio/cards.jsx')
    expect(c).toMatch(/<Head caption=\{`\$\{RACK_NAME\[obj\.type\] \|\| 'Rack'\}\$\{row\}`\}>\n\s+<BigFigure value=\{n\(total\)\} unit="positions" right=\{`\$\{n\(usable\)\} usable`\} \/>/)
    for (const k of ['label="Bays"', "'Beam'", 'label="Depth"', 'label="Flue"', '<ElevationChip />', 'label="Require pick both sides"', 'label="Show markings"']) expect([k, c.includes(k)]).toEqual([k, true])
    expect(c).toMatch(/\[\{ label: 'positions', value: n\(f\.gross\) \}, \{ label: 'usable', value: n\(f\.usable\), accent: true \}, \{ label: 'racks', value: n\(f\.racks\) \}\]/)
    expect(c).toMatch(/height: 26, padding: '0 8px', borderRadius: 6, background: C\.inset, fontSize: 12/)   // the elevation chip
    expect(c).toMatch(/width: 8, height: 8, borderRadius: 2, background: t\.color/)
  })
  it('SC-C7: nothing selected — "Nothing selected", the hint, Layout: positions and the building on an empty plan', () => {
    const c = read('studio/cards.jsx')
    expect(c).toMatch(/>Nothing selected<\/span>\n\s+<span style=\{\{ color: C\.muted, fontSize: 12 \}\}>Click a rack, zone or wall to edit it\.<\/span>/)
    expect(c).toMatch(/\[\{ label: 'positions', value: n\(f\.gross\) \}, \.\.\.\(f\.building \? \[\{ label: 'building', value: f\.building \}\] : \[\]\)\]/)
    expect(c).toMatch(/`\$\{Math\.round\(fp\.width \/ gridSize\)\}′ × \$\{Math\.round\(fp\.height \/ gridSize\)\}′`/)
  })
  it('SC-C6: a zone — "Zone · kind", Name inline, Width / Length, the zone note; a typed size keeps the edge against a wall', () => {
    const c = read('studio/cards.jsx')
    expect(c).toMatch(/<span style=\{\{ color: C\.muted, fontSize: 12 \}\}>Zone · \{kind\}<\/span>/)
    expect(c).toMatch(/<InlineField label="Name"><TextInput words aria="Zone name"/)
    expect(c).toMatch(/commitObjectUpdate\(obj\.id, zoneSized\(st\.objects, cur, \{ \[key\]: ft \* gridSize \}, \{ gridSize \}\)\)/)
    expect(c).toMatch(/<Hint>No racking is placed inside a zone\. Its edges count as walls\.<\/Hint>/)
    expect(read('studio/cardParts.jsx')).toMatch(/<span style=\{\{ width: labelWidth, flexShrink: 0, color: C\.muted, fontSize: 12 \}\}>/)
  })
  it('SC-C5: Check layout is the card\'s own state — the title with its count chips, each item with its level tag, a click zooms and keeps it highlighted, the usable / total footer', () => {
    const c = read('studio/cards.jsx'), f = read('studio/StudioFrame.jsx')
    expect(f).toMatch(/card === 'tabs' && checkOpen\n\s+\? <div data-card-dark[^>]*><CheckCard \/><\/div>/)
    expect(c).toMatch(/<span style=\{\{ fontWeight: 600, color: C\.strong \}\}>Check layout<\/span>/)
    expect(c).toMatch(/onClick=\{\(\) => \(reminder \? openSetup\('settings'\) : goToIssue\(useCanvasStore, it, getCanvasContainerSize\(\)\)\)\}/)
    expect(c).toMatch(/padding: 10, border: 0, borderRadius: 8, background: on \? C\.inset : 'transparent'/)
    expect(c).toMatch(/Click an item to zoom to it<span style=\{\{ marginLeft: 'auto', fontFamily: MONO, color: C\.text \}\}>\{n\(f\.usable\)\} \/ \{n\(f\.gross\)\}<\/span>/)
  })
  it('SC-more: every other section is under one More fold, in the same parts; a rack keeps its bay list, + / − Bay, order, lock and delete', () => {
    const p = read('components/RightPanel/PropertiesPanel.jsx')
    expect(p).toMatch(/<Fold title="More" aria="More properties" last gap=\{10\}>/)
    for (const k of ['<ColumnCheckBody toggles={!rack} />', '<GroupBody />', '<ColorBody />', '<LayerBody />', '<TextBody />', '<LabelsBody />', '<RackRowExtras obj={obj}', '<ObjectActions obj={obj} />', '<Appearance obj={obj}']) expect([k, p.includes(k)]).toEqual([k, true])
    expect(/SectionHeader|Disclosure|var\(--/.test(p)).toBe(false)
  })
})

describe('SC — icons and colours', () => {
  it('SC-icons: no Lucide anywhere in the card — the set\'s icons, or a word where it has none', () => {
    for (const f of CARD) expect([f, /from 'lucide-react'/.test(read(f))]).toEqual([f, false])
  })
  it('SC-usable: a rack\'s usable is its positions less the same losses the layout\'s usable counts, rack by rack', () => {
    // no racks, no losses
    expect(rackPositionsLost('x', [], { check: null })).toBe(0)
    expect(usableCapacity([], { check: null }).usable).toBe(0)
  })
})

describe('SC — hover', () => {
  it('SC-hover: list rows, the More row, Check items, secondary / inset / danger and icon buttons turn #2A2F2C; toggles, swatches, the active segment, a picked row and the mint primary do not', () => {
    const css = read('studio/studio.css'), p = read('studio/cardParts.jsx')
    expect(css).toMatch(/\[data-card-dark\] \.st-hov:hover:not\(:disabled\):not\(\[data-on\]\):not\(\[aria-pressed="true"\]\) \{ background:#2A2F2C !important; \}/)
    expect(p).toMatch(/className=\{kind === 'primary' \? undefined : 'st-hov'\}/)
    expect(p).toMatch(/<button type="button" className="st-hov" aria-expanded=\{open\}/)          // the More row (Fold)
    expect(p).toMatch(/<button type="button" className="st-hov" aria-label=\{label\}/)            // icon buttons
    expect(read('studio/cards.jsx')).toMatch(/<button key=\{it\.kind \+ i\} type="button" className="st-hov"/)   // Check items
    expect(read('components/RightPanel/panels/RackRowPanelCore.jsx')).toMatch(/role="listitem" className="st-hov" data-on=\{isActive \|\| undefined\}/)
    // never on a toggle or a segment
    const toggle = p.slice(p.indexOf('export function Toggle'), p.indexOf('export const ToggleRow')), seg = p.slice(p.indexOf('export function Seg'), p.indexOf('export function Btn'))
    expect([/st-hov/.test(toggle), /st-hov/.test(seg)]).toEqual([false, false])
    expect(readFileSync(new URL('../../../STUDIO.md', import.meta.url), 'utf8')).toMatch(/\*\*Hover in the right card\*\*: list rows, the More row, Check items, secondary \(ghost\), inset and danger buttons → background `#2A2F2C`/)
  })
})
