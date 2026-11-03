import { useCanvasStore } from '../store/useCanvasStore'
import { TOOLS } from '../constants'
import { SPLIT_TOOL, useSplit } from '../utils/splitTool'
import { Icon } from '../studio/Icon'
import { B, MONO, modePill, Sep, CloseBtn } from '../studio/barParts'

/* Split's mode bar (STUDIO.md §1; design/studio/Studio.dc.html C9), top 76, while the Split tool is on: its icon and
   name, what to do, "Esc to finish", ✕ — the same as Esc (utils/splitTool.js): the cut's hover goes, back to Select.
   After a cut the piece follows the mouse as a placement (its own notice, RowGroupBar.jsx). */
export function SplitBar() {
  const tool = useCanvasStore(s => s.activeTool)
  if (tool !== SPLIT_TOOL) return null
  const close = () => { useSplit.setState({ hover: null }); useCanvasStore.getState().setActiveTool(TOOLS.SELECT) }
  return (
    <div role="toolbar" aria-label="Split" data-mode-bar="split" className="st-pill" style={modePill}>
      <Icon name="Split" active />
      <span style={{ fontWeight: 600, color: B.strong }}>Split</span>
      <span style={{ color: B.muted, fontSize: 12 }}>Click a row where to cut · drag the piece away</span>
      <Sep />
      <span style={{ color: B.muted, fontSize: 12 }}><span style={{ fontFamily: MONO, color: B.text }}>Esc</span> to finish</span>
      <CloseBtn label="Close Split" title="Done (Esc)" onClick={close} />
    </div>
  )
}
