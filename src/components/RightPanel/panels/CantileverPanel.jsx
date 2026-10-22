import { useCanvasStore } from '../../../store/useCanvasStore'
import { useShallow } from 'zustand/react/shallow'
import { withAnchoredPosition } from '../../../utils/bayAnchor'
import { getObjectBounds } from '../../../utils/canvas'
import { C, MONO, Grid2, Seg, Btn, Totals, SecLabel } from '../../../studio/cardParts'

// ── Cantilever Properties Panel ───────────────────────────────────────────────
const CANT_ARM_LENGTHS = [36, 48, 52, 60, 72]
const TOWER_WIDTHS     = [8, 10]
const TSPACE_IN        = 48

/* a caption over a control group (a div, not a <label>: a label would forward its clicks to the first button) */
const Labeled = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><SecLabel>{label}</SecLabel>{children}</div>
)

export function CantileverPanel({ obj }) {
  const { updateObject, commitObjectUpdate, gridSize } = useCanvasStore(useShallow(s => ({ updateObject: s.updateObject, commitObjectUpdate: s.commitObjectUpdate, gridSize: s.gridSize })))

  const towers      = obj.towers      || [36, 36, 36, 36, 36]
  const doubleSided = obj.doubleSided ?? true
  const towerWidthIn= obj.towerWidthIn || 10
  const spineDepthIn= obj.spineDepthIn || 4
  const activeTower = obj.activeTowerIdx ?? null

  const fmtIn = (i) => {
    const ft = Math.floor(i / 12), inc = i % 12
    return inc === 0 ? `${ft}'` : `${ft}' ${inc}"`
  }

  const totalIn  = (towers.length - 1) * TSPACE_IN
  const depthIn  = doubleSided ? towers[activeTower ?? 0] * 2 + spineDepthIn : towers[activeTower ?? 0] + spineDepthIn

  const calcH = (ts, dual) => {
    const maxArm = Math.max(...ts)
    return ((dual ? maxArm * 2 + spineDepthIn : maxArm + spineDepthIn) / 12) * gridSize
  }

  const addTower = () => {
    const newTowers = [...towers, towers[towers.length - 1] || 36]
    const newW = ((newTowers.length - 1) * TSPACE_IN / 12) * gridSize
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { towers: newTowers, width: newW }))
  }

  const removeTower = () => {
    if (towers.length <= 2) return
    const newTowers = towers.slice(0, -1)
    const newW = ((newTowers.length - 1) * TSPACE_IN / 12) * gridSize
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { towers: newTowers, width: newW, activeTowerIdx: null }))
  }

  const changeTowerArm = (tIdx, newArmIn) => {
    // All arms must be the same length -- fill entire array
    const newTowers = Array(towers.length).fill(newArmIn)
    const newH = calcH(newTowers, doubleSided)
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { towers: newTowers, height: newH }))
  }

  const toggleSide = (val) => {
    const newH = calcH(towers, val)
    commitObjectUpdate(obj.id, withAnchoredPosition(obj, { doubleSided: val, height: newH }))
  }

  const canRemove = towers.length > 2

  /* Studio card: a column of card parts; PropertiesPanel wraps it in the card block (padding 12px 16px). */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>

      {/* Status */}
      <Totals items={[
        { label: 'Total length', value: fmtIn(totalIn) },
        { label: 'Towers', value: towers.length },
        { label: 'Type', value: doubleSided ? 'Double-sided' : 'Single-sided' },
      ]} />

      {/* Tower list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <SecLabel>Towers ({towers.length})</SecLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {towers.map((armIn, i) => {
            const isActive = activeTower === i
            return (
              <div key={i} className="st-hov" data-on={isActive || undefined} onClick={() => updateObject(obj.id, { activeTowerIdx: isActive ? null : i })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
                  height: 30, padding: '0 10px', borderRadius: 6, cursor: 'pointer',
                  background: isActive ? C.active : C.inset, fontFamily: MONO, fontSize: 12,
                }}>
                <span style={{ color: isActive ? C.accent : C.muted, minWidth: 22 }}>T{i+1}</span>
                <span style={{ flex: 1, minWidth: 0, color: isActive ? C.accent : C.strong }}>{fmtIn(armIn)} arm</span>
                <span style={{ color: isActive ? C.accent : C.muted }}>{armIn}"</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Active tower arm selector */}
      {activeTower !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <SecLabel>All arms -- select length</SecLabel>
          <Seg mono aria="Arm length" value={towers[activeTower]} onChange={a => changeTowerArm(activeTower, a)}
            options={CANT_ARM_LENGTHS.map(a => ({ value: a, label: `${a}"` }))} />
        </div>
      )}

      {/* Add / Remove tower */}
      <Grid2>
        <Btn kind="ghost" onClick={addTower}>+ Tower</Btn>
        <Btn kind="danger" onClick={removeTower} disabled={!canRemove}
          style={canRemove ? undefined : { color: C.faint, cursor: 'not-allowed' }}>- Tower</Btn>
      </Grid2>

      {/* Single / Double sided · tower width */}
      <Grid2>
        <Labeled label="Sides">
          <Seg aria="Sides" value={doubleSided} onChange={toggleSide}
            options={[false, true].map(v => ({ value: v, label: v ? 'Double' : 'Single' }))} />
        </Labeled>
        <Labeled label="Tower">
          <Seg mono aria="Tower width" value={towerWidthIn} onChange={t => commitObjectUpdate(obj.id, { towerWidthIn: t })}
            options={TOWER_WIDTHS.map(t => ({ value: t, label: `${t}"` }))} />
        </Labeled>
      </Grid2>

    </div>
  )
}
