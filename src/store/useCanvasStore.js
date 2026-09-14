import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { nanoid } from 'nanoid'
import { TOOLS, UNITS, DEFAULT_LAYERS } from '../constants'
import { initFpVerts } from '../utils/canvas'
import { serializeScene, deserializeScene, downloadScene, pickFile, autoSave, autoLoad, hasAutoSave, clearAutoSave, exportToPDF } from '../utils/saveLoad'

const MAX_HISTORY = 60

function pushHistory(s) {
  const snap = JSON.stringify({ objects: s.objects, groups: s.groups || [] })
  s.history = [...s.history.slice(0, s.historyIndex+1), snap].slice(-MAX_HISTORY)
  s.historyIndex = s.history.length - 1
  // Auto-save full scene to localStorage on every undoable action
  try { autoSave(serializeScene(s)) } catch {}
}

export const useCanvasStore = create(
  immer((set) => ({

    // ─── Active wall (for floor plan wall editing) ───────────────────────────
    activeWall: null,   // { objId, wallIdx } | null
    setActiveWall: (w) => set((s) => { s.activeWall = w }),

    // ─── Tool ───────────────────────────────────────────────────────────────
    activeTool: TOOLS.PAN,
    setActiveTool: (tool) => set((s) => { s.activeTool = tool }),

    // ─── Viewport ───────────────────────────────────────────────────────────
    zoom: 1,
    panX: 80,
    panY: 80,
    setZoom: (z)    => set((s) => { s.zoom = Math.max(0.01, Math.min(20, z)) }),
    setPan:  (x, y) => set((s) => { s.panX = x; s.panY = y }),
    // Atomic zoom + pan — avoids two-render race
    setViewport: (z, px, py) => set((s) => { s.zoom = Math.max(0.01, Math.min(20, z)); s.panX = px; s.panY = py }),

    // ─── Units / Scale / Snap ───────────────────────────────────────────────
    unit:     UNITS.FT_IN,
    scale:    '1:50',
    snapUnit: 'in',          // 'ft' | 'in' | 'half-in'
    gridSize: 40,            // px per foot
    setUnit:     (u) => set((s) => { s.unit     = u }),
    setScale:    (v) => set((s) => { s.scale    = v }),
    setSnapUnit: (v) => set((s) => { s.snapUnit = v }),

    // ─── Floor Plan defaults (for picker) ───────────────────────────────────
    fpDefaults: { wallThicknessFt: 0.25 },
    setFpDefaults: (updates) => set((s) => { Object.assign(s.fpDefaults, updates) }),

    // Place a floor plan object centered on the visible viewport
    placeFpObject: ({ type, widthFt, heightFt }) => set((s) => {
      const el  = document.getElementById('canvas-container')
      const cw  = el ? el.clientWidth  : 900
      const ch  = el ? el.clientHeight : 600
      const GS  = s.gridSize
      const W   = widthFt  * GS
      const H   = heightFt * GS
      const wallPx = s.fpDefaults.wallThicknessFt * GS  // 3" = 0.25ft * 40 = 10px

      // Place at world origin offset so it's nicely visible
      // Snap to nearest gridSize
      const objX = Math.round(-W / 2 / GS) * GS
      const objY = Math.round(-H / 2 / GS) * GS

      s.objects.push({
        id:              nanoid(),
        type,
        x:               objX,
        y:               objY,
        width:           W,
        height:          H,
        fill:            '#ffffff',
        stroke:          '#333333',
        strokeWidth:     wallPx,
        wallThicknessFt: s.fpDefaults.wallThicknessFt,
        fpStemW:         0.3,
        fpStemH:         0.3,
        fpBarH:          0.3,
        fpTBarHL:        0.3,    // T: left bar height (independent)
        fpTBarHR:        0.3,    // T: right bar height (independent)
        fpTStemL:        0.325,   // T: left edge of stem (ratio)
        fpTStemR:        0.675,   // T: right edge of stem (ratio)
        fpCrossLXT:      0.325,   // Cross: left col edge at top
        fpCrossRXT:      0.675,   // Cross: right col edge at top
        fpCrossLXB:      0.325,   // Cross: left col edge at bottom
        fpCrossRXB:      0.675,   // Cross: right col edge at bottom
        fpCrossTYR:      0.325,   // Cross: top row edge at right
        fpCrossBYR:      0.675,   // Cross: bottom row edge at right
        fpCrossTYL:      0.325,   // Cross: top row edge at left
        fpCrossBYL:      0.675,   // Cross: bottom row edge at left
        fpUWallT:        0.28,
        fpUOpenH:        0.62,
        labelFontSize:   Math.round(Math.min(W, H) * 0.10),
        showWallLabel:   false,
        layerId:         s.activeLayerId,
        opacity:         1,
        rotation:        0,
        noFill:          false,
        label:           '',
        // Initialize vertex array for all fp shapes (clean wall-drag system)
        fpVerts: initFpVerts(type, objX, objY, W, H, {
          fpStemW: 0.3, fpStemH: 0.3, fpBarH: 0.3,
          fpTStemL: 0.325, fpTStemR: 0.675,
          fpUWallT: 0.28, fpUOpenH: 0.62,
          fpCrossT: 0.35,
        }),
      })
      s.selectedIds = [s.objects[s.objects.length-1].id]

      // Zoom to fit the placed object with 10% padding
      const pad    = 0.10
      const scaleX = cw  / (W * (1 + pad * 2))
      const scaleY = ch  / (H * (1 + pad * 2))
      const nz     = Math.max(0.01, Math.min(4, Math.min(scaleX, scaleY)))
      // Pan so object centre is at screen centre
      s.zoom = nz
      s.panX = cw / 2 - (objX + W / 2) * nz
      s.panY = ch / 2 - (objY + H / 2) * nz

      pushHistory(s)
    }),

    // ─── Objects ────────────────────────────────────────────────────────────
    objects:     [],
    selectedIds: [],
    activeBaySelection: [],  // [{ objId, bayIdx }] — cross-row bay multi-select
    showAisles:   true,
    toggleAisles: () => set(s => { s.showAisles = !s.showAisles }),
    selectedWall: null,
    setSelectedWall: (fpId, wallIndex) => set((s) => { s.selectedWall = { fpId, wallIndex } }),
    clearSelectedWall: () => set((s) => { s.selectedWall = null }),

    addObject: (obj) => set((s) => {
      s.objects.push({
        id:          nanoid(),
        layerId:     s.activeLayerId,
        strokeWidth: 1.5,
        opacity:     1,
        rotation:    0,
        noFill:      false,
        ...obj,
      })
      pushHistory(s)
    }),

    updateObject: (id, updates) => set((s) => {
      const o = s.objects.find((o) => o.id === id)
      if (o) Object.assign(o, updates)
    }),

    commitObjectUpdate: (id, updates) => set((s) => {
      const o = s.objects.find((o) => o.id === id)
      if (o) { Object.assign(o, updates); pushHistory(s) }
    }),

    moveObjects: (ids, dx, dy) => set((s) => {
      const FP_SET = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
      const movedFpIds = []

      const applyMove = (obj) => {
        if (obj.type === 'circle') { obj.cx += dx; obj.cy += dy }
        else if ('x1' in obj)     { obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy }
        else {
          if ('x' in obj) obj.x += dx
          if ('y' in obj) obj.y += dy
          if (obj.tailX !== undefined) { obj.tailX += dx; obj.tailY += dy }
        }
        if (obj.fpVerts) { obj.fpVerts = obj.fpVerts.map(v => ({x: v.x+dx, y: v.y+dy})) }
      }

      s.objects.forEach((obj) => {
        if (!ids.includes(obj.id)) return
        if (FP_SET.has(obj.type)) movedFpIds.push(obj.id)
        applyMove(obj)
      })

      // Cascade: children of moved fp objects move with the parent
      if (movedFpIds.length) {
        s.objects.forEach((obj) => {
          if (!obj.parentId || !movedFpIds.includes(obj.parentId)) return
          if (ids.includes(obj.id)) return  // already moved directly, skip double-move
          applyMove(obj)
        })
      }
      pushHistory(s)
    }),

    // Move ALL objects — called when the floor plan itself is dragged
    moveAllObjects: (dx, dy) => set((s) => {
      if (dx === 0 && dy === 0) {
        pushHistory(s) // commit with no movement (called on mouseup to save history)
        return
      }
      s.objects.forEach((obj) => {
        if (obj.type === 'circle') { obj.cx += dx; obj.cy += dy }
        else if ('x1' in obj)     { obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy }
        else {
          if ('x' in obj) obj.x += dx
          if ('y' in obj) obj.y += dy
          if (obj.tailX !== undefined) { obj.tailX += dx; obj.tailY += dy }
        }
        if (obj.fpVerts) { obj.fpVerts = obj.fpVerts.map(v => ({x: v.x+dx, y: v.y+dy})) }
      })
      // No pushHistory during live drag — only on mouseup (dx=0,dy=0 call above)
    }),

    // ─── Floor plan parent-child ─────────────────────────────────────────────
    attachToParent: (childId, parentId) => set((s) => {
      const child = s.objects.find(o => o.id === childId)
      if (child) child.parentId = parentId || undefined
    }),

    // ─── Z-order ─────────────────────────────────────────────────────────────
    bringForward: () => set((s) => {
      s.selectedIds.forEach(id => {
        const i = s.objects.findIndex(o => o.id === id)
        if (i < s.objects.length - 1) {
          const tmp = s.objects[i]; s.objects[i] = s.objects[i+1]; s.objects[i+1] = tmp
        }
      })
      pushHistory(s)
    }),
    sendBackward: () => set((s) => {
      s.selectedIds.forEach(id => {
        const i = s.objects.findIndex(o => o.id === id)
        if (i > 0) {
          const tmp = s.objects[i]; s.objects[i] = s.objects[i-1]; s.objects[i-1] = tmp
        }
      })
      pushHistory(s)
    }),
    bringToFront: () => set((s) => {
      const sel = s.objects.filter(o => s.selectedIds.includes(o.id))
      s.objects = [...s.objects.filter(o => !s.selectedIds.includes(o.id)), ...sel]
      pushHistory(s)
    }),
    sendToBack: () => set((s) => {
      const sel = s.objects.filter(o => s.selectedIds.includes(o.id))
      s.objects = [...sel, ...s.objects.filter(o => !s.selectedIds.includes(o.id))]
      pushHistory(s)
    }),

    // ─── Per-object lock ─────────────────────────────────────────────────────
    toggleLockSelected: () => set((s) => {
      const anyUnlocked = s.objects.some(o => s.selectedIds.includes(o.id) && !o.locked)
      s.objects.forEach(o => {
        if (s.selectedIds.includes(o.id)) o.locked = anyUnlocked
      })
      pushHistory(s)
    }),

    deleteSelected: () => set((s) => {
      const selSet = new Set(s.selectedIds)
      // Expand to full group members if any selected object is in a group
      const groupMemberIds = (s.groups || [])
        .filter(g => g.ids.some(id => selSet.has(id)))
        .flatMap(g => g.ids)
      // Expand to fp children if any selected object is an fp
      const FP_SET = new Set(['fp_rect','fp_l','fp_t','fp_u','fp_cross','fp_l_mirror'])
      const fpChildIds = s.objects
        .filter(o => o.parentId && selSet.has(o.parentId))
        .map(o => o.id)
      const allDelIds = new Set([...s.selectedIds, ...groupMemberIds, ...fpChildIds])
      s.objects     = s.objects.filter(o => !allDelIds.has(o.id))
      // Remove groups that are now empty or had members deleted
      s.groups      = (s.groups || []).filter(g => g.ids.some(id => !allDelIds.has(id)))
      // Clear dangling parentIds
      s.objects.forEach(o => { if (o.parentId && allDelIds.has(o.parentId)) delete o.parentId })
      s.selectedIds = []
      pushHistory(s)
    }),

    // Remove a single object from its group without deleting it
    removeFromGroup: (objId) => set((s) => {
      s.groups = (s.groups || []).map(g => {
        if (!g.ids.includes(objId)) return g
        const newIds = g.ids.filter(id => id !== objId)
        return { ...g, ids: newIds }
      }).filter(g => g.ids.length >= 2)  // disband group if fewer than 2 members remain
      // Deselect the object so it's clear it's been removed
      s.selectedIds = s.selectedIds.filter(id => id !== objId)
      pushHistory(s)
    }),

    selectObject: (id, addToSel = false) => set((s) => {
      if (!id) { s.selectedIds = []; return }
      if (addToSel) {
        const i = s.selectedIds.indexOf(id)
        if (i >= 0) s.selectedIds.splice(i, 1); else s.selectedIds.push(id)
      } else {
        const switching = !s.selectedIds.includes(id) || s.selectedIds.length > 1
        s.selectedIds = [id]
        // Only clear bay highlights when switching to a different object
        if (switching) {
          s.activeBaySelection = []
          s.objects.forEach(o => {
            if (o.id !== id && o.activeBayIdx != null) o.activeBayIdx = null
            if (o.id !== id && o.activeTowerIdx != null) o.activeTowerIdx = null
          })
        }
      }
    }),
    selectMultiple: (ids) => set((s) => {
      ids.forEach((id) => { if (!s.selectedIds.includes(id)) s.selectedIds.push(id) })
    }),
    selectGroup: (ids) => set((s) => { s.selectedIds = [...ids] }), // replace, not add

    // ── Aisle creation ──────────────────────────────────────────────────────
    createAisle: (row1Id, row2Id, label = '') => set((s) => {
      // Don't create duplicate
      const exists = s.objects.some(o =>
        o.type === 'aisle' &&
        ((o.row1Id === row1Id && o.row2Id === row2Id) ||
         (o.row1Id === row2Id && o.row2Id === row1Id))
      )
      if (exists) return
      s.objects.push({
        id:      nanoid(),
        type:    'aisle',
        row1Id,
        row2Id,
        label,
        layerId: s.activeLayerId,
        locked:  false,
      })
      pushHistory(s)
    }),

    // ── Bay multi-select ────────────────────────────────────────────────────
    setBaySelection: (entries) => set((s) => { s.activeBaySelection = entries }),
    clearBaySelection: () => set((s) => { s.activeBaySelection = [] }),
    clearAllBaySelections: () => set((s) => {
      s.activeBaySelection = []
      s.objects.forEach(o => {
        if (o.activeBayIdx != null) o.activeBayIdx = null
        if (o.activeTowerIdx != null) o.activeTowerIdx = null
      })
    }),
    toggleBayInSelection: (objId, bayIdx) => set((s) => {
      const idx = s.activeBaySelection.findIndex(e => e.objId === objId && e.bayIdx === bayIdx)
      if (idx >= 0) s.activeBaySelection.splice(idx, 1)
      else s.activeBaySelection.push({ objId, bayIdx })
    }),
    deleteSingleBay: (objId, bayIdx) => set((s) => {
      const idx = s.objects.findIndex(o => o.id === objId)
      if (idx === -1) return
      const beams = [...s.objects[idx].beams]
      if (beams.length <= 1) return
      const newBeams = beams.filter((_, i) => i !== bayIdx)
      const upIn = s.objects[idx].uprightWidth || 3
      const totalIn = upIn * (newBeams.length + 1) + newBeams.reduce((a,b)=>a+b, 0)
      s.objects[idx].beams = newBeams
      s.objects[idx].width = (totalIn / 12) * 40
      s.objects[idx].activeBayIdx = null
      pushHistory(s)
    }),

    deleteSelectedBays: () => set((s) => {
      // Group by objId
      const byObj = {}
      s.activeBaySelection.forEach(({ objId, bayIdx }) => {
        if (!byObj[objId]) byObj[objId] = []
        byObj[objId].push(bayIdx)
      })
      s.objects.forEach(obj => {
        if (!byObj[obj.id]) return
        const toRemove = new Set(byObj[obj.id])
        const newBeams = obj.beams.filter((_, i) => !toRemove.has(i))
        if (newBeams.length === 0) return  // don't remove all bays
        const upIn = obj.uprightWidth || 3
        const totalIn = upIn * (newBeams.length + 1) + newBeams.reduce((s,b)=>s+b,0)
        obj.beams = newBeams
        obj.width = (totalIn / 12) * 40
        obj.activeBayIdx = null
      })
      s.activeBaySelection = []
      pushHistory(s)
    }),
    changeSelectedBaysBeam: (beamIn) => set((s) => {
      const byObj = {}
      s.activeBaySelection.forEach(({ objId, bayIdx }) => {
        if (!byObj[objId]) byObj[objId] = []
        byObj[objId].push(bayIdx)
      })
      s.objects.forEach(obj => {
        if (!byObj[obj.id]) return
        const newBeams = [...obj.beams]
        byObj[obj.id].forEach(bayIdx => { newBeams[bayIdx] = beamIn })
        const upIn = obj.uprightWidth || 3
        const totalIn = upIn * (newBeams.length + 1) + newBeams.reduce((s,b)=>s+b,0)
        obj.beams = newBeams
        obj.width = (totalIn / 12) * 40
      })
      pushHistory(s)
    }),
    selectAll:      () => set((s) => { s.selectedIds = s.objects.map((o) => o.id) }),
    clearSelection: () => set((s) => {
      s.selectedIds = []
      s.activeBaySelection = []
      s.objects.forEach(o => {
        if (o.activeBayIdx != null) o.activeBayIdx = null
        if (o.activeTowerIdx != null) o.activeTowerIdx = null
      })
    }),

    // ─── Clipboard ──────────────────────────────────────────────────────────
    clipboard: [],
    pasteCount: 0,   // increments per paste so repeated pastes offset rather than stack
    copySelected: () => set((s) => {
      const selSet = new Set(s.selectedIds)
      // Expand to include all members of any group that has a selected member
      const groupMemberIds = (s.groups || [])
        .filter(g => g.ids.some(id => selSet.has(id)))
        .flatMap(g => g.ids)
      // Also grab fp children whose parent is in the selection
      const expandedSet = new Set([...s.selectedIds, ...groupMemberIds])
      const childIds = s.objects
        .filter(o => o.parentId && expandedSet.has(o.parentId))
        .map(o => o.id)
      const allIds = new Set([...expandedSet, ...childIds])
      s.clipboard = s.objects.filter(o => allIds.has(o.id)).map(o => ({ ...o }))
      s.pasteCount = 0
    }),
    cutSelected: () => set((s) => {
      const selSet = new Set(s.selectedIds)
      const groupMemberIds = (s.groups || [])
        .filter(g => g.ids.some(id => selSet.has(id)))
        .flatMap(g => g.ids)
      const expandedSet = new Set([...s.selectedIds, ...groupMemberIds])
      const childIds = s.objects
        .filter(o => o.parentId && expandedSet.has(o.parentId))
        .map(o => o.id)
      const allIds = new Set([...expandedSet, ...childIds])
      s.clipboard  = s.objects.filter(o => allIds.has(o.id)).map(o => ({ ...o }))
      s.objects    = s.objects.filter(o => !allIds.has(o.id))
      // Clean up groups that had all members cut
      s.groups = (s.groups || []).filter(g => g.ids.some(id => !allIds.has(id)))
      s.selectedIds = []
      s.pasteCount = 0
      pushHistory(s)
    }),
    paste: () => set((s) => {
      if (!s.clipboard.length) return

      // Compute bounding box of clipboard objects
      let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity
      s.clipboard.forEach(o => {
        const x = o.cx ?? o.x1 ?? o.x ?? 0
        const y = o.cy ?? o.y1 ?? o.y ?? 0
        const r = o.cx ? o.cx+(o.rx??0) : o.x2 ?? ((o.x??0)+(o.width??0))
        const b = o.cy ? o.cy+(o.ry??0) : o.y2 ?? ((o.y??0)+(o.height??0))
        minX=Math.min(minX,x); minY=Math.min(minY,y)
        maxX=Math.max(maxX,r); maxY=Math.max(maxY,b)
      })
      const clipH = maxY - minY

      // Each successive paste nudges by 20px more; resets when clipboard changes
      s.pasteCount = (s.pasteCount || 0) + 1
      const pasteOffsetX = s.pasteCount * 20
      const pasteOffsetY = s.pasteCount * 20

      // Remap IDs: old id → new id (for parentId + group rewriting)
      const idMap = {}
      s.clipboard.forEach(o => { idMap[o.id] = nanoid() })

      const newObjs = s.clipboard.map(o => {
        const newId = idMap[o.id]
        const newParentId = o.parentId ? (idMap[o.parentId] ?? o.parentId) : undefined
        const shifted = { ...o, id: newId }
        if (newParentId) shifted.parentId = newParentId; else delete shifted.parentId

        const dx = pasteOffsetX, dy = pasteOffsetY
        if (shifted.type === 'circle') { shifted.cx += dx; shifted.cy += dy }
        else if ('x1' in shifted)      { shifted.x1 += dx; shifted.y1 += dy; shifted.x2 += dx; shifted.y2 += dy }
        else {
          if ('x' in shifted) shifted.x += dx
          if ('y' in shifted) shifted.y += dy
          if (shifted.tailX !== undefined) { shifted.tailX += dx; shifted.tailY += dy }
        }
        if (shifted.fpVerts)           { shifted.fpVerts = shifted.fpVerts.map(v => ({x:v.x+dx, y:v.y+dy})) }
        return shifted
      })

      // Recreate any groups that were fully within the clipboard
      const clipIds = new Set(s.clipboard.map(o => o.id))
      const pastedGroups = (s.groups || [])
        .filter(g => g.ids.every(id => clipIds.has(id)))
        .map(g => ({ id: nanoid(), ids: g.ids.map(id => idMap[id]).filter(Boolean) }))
        .filter(g => g.ids.length >= 2)

      s.objects.push(...newObjs)
      if (pastedGroups.length) s.groups.push(...pastedGroups)
      s.selectedIds = newObjs.map(o => o.id)
      pushHistory(s)
    }),

    // ─── Groups ─────────────────────────────────────────────────────────────
    groups: [],
    groupSelected: () => set((s) => {
      if (s.selectedIds.length < 2) return
      const selSet = new Set(s.selectedIds)
      // Find all existing groups that have any selected member
      const overlapping = (s.groups || []).filter(g => g.ids.some(id => selSet.has(id)))
      // Merge: union of selectedIds + all members of any overlapping group
      const mergedIds = [...new Set([
        ...s.selectedIds,
        ...overlapping.flatMap(g => g.ids),
      ])]
      // Remove overlapping groups, add one merged group
      s.groups = (s.groups || []).filter(g => !overlapping.includes(g))
      s.groups.push({ id: nanoid(), ids: mergedIds })
      // Select all merged members so GroupPanel highlights them all
      s.selectedIds = mergedIds
      pushHistory(s)
    }),
    ungroupSelected: () => set((s) => {
      const selSet = new Set(s.selectedIds)
      s.groups = (s.groups || []).filter(g => !g.ids.some(id => selSet.has(id)))
      pushHistory(s)
    }),
    rotateGroup: (groupId, angleDeg, basePositions) => set((s) => {
      const grp = s.groups.find(g => g.id === groupId)
      if (!grp) return
      const members = s.objects.filter(o => grp.ids.includes(o.id))
      // Use basePositions (snapshot from drag-start) if provided — eliminates float drift
      const base = basePositions || {}
      // Compute group bounding box center from base (or current) positions
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
      members.forEach(o => {
        const b = base[o.id]
        const x = b ? (b.cx ?? b.x1 ?? b.x ?? 0) : (o.cx ?? o.x1 ?? o.x ?? 0)
        const y = b ? (b.cy ?? b.y1 ?? b.y ?? 0) : (o.cy ?? o.y1 ?? o.y ?? 0)
        const bw = b ? ((b.cx ? b.cx+(b.rx||0) : b.x2 ?? ((b.x??0)+(b.width??0)))) : (o.cx ? o.cx+(o.rx||0) : o.x2 ?? ((o.x??0)+(o.width??0)))
        const bh = b ? ((b.cy ? b.cy+(b.ry||0) : b.y2 ?? ((b.y??0)+(b.height??0)))) : (o.cy ? o.cy+(o.ry||0) : o.y2 ?? ((o.y??0)+(o.height??0)))
        minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,bw);maxY=Math.max(maxY,bh)
      })
      const cx = (minX+maxX)/2, cy = (minY+maxY)/2
      const rad = (angleDeg * Math.PI) / 180
      const cos = Math.cos(rad), sin = Math.sin(rad)
      const rotPt = (px, py) => ({
        x: cx + (px-cx)*cos - (py-cy)*sin,
        y: cy + (px-cx)*sin + (py-cy)*cos,
      })
      members.forEach(o => {
        const b = base[o.id] || o
        const baseRot = base[o.id]?.rotation ?? o.rotation ?? 0
        o.rotation = (baseRot + angleDeg) % 360
        if (o.type === 'circle') {
          const np = rotPt(b.cx, b.cy); o.cx = np.x; o.cy = np.y
        } else if ('x1' in o) {
          const p1 = rotPt(b.x1,b.y1); const p2 = rotPt(b.x2,b.y2)
          o.x1=p1.x;o.y1=p1.y;o.x2=p2.x;o.y2=p2.y
        } else if (o.fpVerts) {
          const np = rotPt((b.x||0)+(b.width||0)/2, (b.y||0)+(b.height||0)/2)
          o.x = np.x - (o.width||0)/2; o.y = np.y - (o.height||0)/2
          const baseVerts = base[o.id]?.fpVerts || o.fpVerts
          o.fpVerts = baseVerts.map(v => { const r = rotPt(v.x, v.y); return {x:r.x, y:r.y} })
        } else if ('x' in o && 'width' in o) {
          const np = rotPt((b.x||0)+(b.width||0)/2, (b.y||0)+(b.height||0)/2)
          o.x = np.x - (o.width||0)/2; o.y = np.y - (o.height||0)/2
        }
      })
      pushHistory(s)
    }),

    // ─── Apply color to currently selected objects ───────────────────────────
    applyFillToSelected: (color, noFill) => set((s) => {
      s.fillColor = color
      if (noFill !== undefined) s.noFill = noFill
      s.objects.forEach(o => {
        if (!s.selectedIds.includes(o.id)) return
        if (noFill !== undefined) o.noFill = noFill
        if (!noFill) {
          const hexOp = Math.round((s.opacity / 100) * 255).toString(16).padStart(2, '0')
          o.fill = color + hexOp
        } else {
          o.fill = 'none'
        }
      })
      pushHistory(s)
    }),
    applyStrokeToSelected: (color) => set((s) => {
      s.strokeColor = color
      s.objects.forEach(o => {
        if (s.selectedIds.includes(o.id)) o.stroke = color
      })
      pushHistory(s)
    }),
    history:      [],
    historyIndex: -1,
    undo: () => set((s) => {
      if (s.historyIndex > 0) {
        s.historyIndex--
        const snap = JSON.parse(s.history[s.historyIndex])
        s.objects = snap.objects ?? snap   // backward compat with old object-only snapshots
        s.groups  = snap.groups  ?? s.groups
        s.selectedIds = []
      }
    }),
    redo: () => set((s) => {
      if (s.historyIndex < s.history.length-1) {
        s.historyIndex++
        const snap = JSON.parse(s.history[s.historyIndex])
        s.objects = snap.objects ?? snap
        s.groups  = snap.groups  ?? s.groups
        s.selectedIds = []
      }
    }),

    // ─── Layers ─────────────────────────────────────────────────────────────
    layers:        DEFAULT_LAYERS,
    activeLayerId: 'racks',
    setActiveLayer: (id) => set((s) => { s.activeLayerId = id }),
    addLayer: () => set((s) => {
      const colors = ['#4a9eff','#22c55e','#f0b429','#a855f7','#ef4444','#ec4899']
      s.layers.push({ id: nanoid(), name: 'New Layer', color: colors[s.layers.length%colors.length], visible: true, locked: false })
    }),
    updateLayer:  (id, u) => set((s) => { const l=s.layers.find(l=>l.id===id); if(l) Object.assign(l,u) }),
    deleteLayer:  (id) => set((s) => {
      s.layers = s.layers.filter(l=>l.id!==id)
      if (s.activeLayerId===id && s.layers.length) s.activeLayerId = s.layers[0].id
    }),

    // ─── Labels ─────────────────────────────────────────────────────────────
    labels: [
      { id:'l1', text:'Zone A – Receiving', color:'#4a9eff', count:3  },
      { id:'l2', text:'Zone B – Storage',   color:'#22c55e', count:12 },
      { id:'l3', text:'Hazmat Area',         color:'#ef4444', count:1  },
    ],
    addLabel:    (l) => set((s) => { s.labels.push({ id:nanoid(), count:0, color:'#4a9eff', ...l }) }),
    deleteLabel: (id) => set((s) => { s.labels = s.labels.filter(l=>l.id!==id) }),

    // ─── Custom Objects ──────────────────────────────────────────────────────
    customObjects: [
      { id:'co1', name:'Loading Bay',  dims:'12×24ft', color:'#a855f7' },
      { id:'co2', name:'Pick Station', dims:'8×12ft',  color:'#4a9eff' },
    ],
    saveAsCustomObject:  (name) => set((s) => {
      const sel = s.objects.filter(o=>s.selectedIds.includes(o.id))
      if (!sel.length) return
      s.customObjects.push({ id:nanoid(), name, objectCount:sel.length, color:'#f0b429' })
    }),
    deleteCustomObject: (id) => set((s) => { s.customObjects=s.customObjects.filter(c=>c.id!==id) }),

    // ─── Forklift ───────────────────────────────────────────────────────────
    activeForkliftId: 'std',
    setActiveForklift: (id) => set((s) => { s.activeForkliftId = id }),

    // ─── UI ─────────────────────────────────────────────────────────────────
    showGrid:   true,
    showRulers: true,
    snapToGrid: true,
    toggleGrid:   () => set((s) => { s.showGrid   = !s.showGrid }),
    toggleRulers: () => set((s) => { s.showRulers = !s.showRulers }),
    toggleSnap:   () => set((s) => { s.snapToGrid = !s.snapToGrid }),

    // ─── Text settings ───────────────────────────────────────────────────────
    textSettings: { fontFamily:'Montserrat', fontSize:14, bold:false, italic:false, underline:false, align:'left' },
    uiTheme: 'studio',     // 'obsidian' | 'studio' | 'blueprint'
    uiScale: 'md',         // 'sm' | 'md' | 'lg'
    setUiTheme: (theme) => set((s) => { s.uiTheme = theme }),
    setUiScale: (scale) => set((s) => { s.uiScale = scale }),
    setTextSetting: (k,v) => set((s) => { s.textSettings[k]=v }),

    // ─── Colors ─────────────────────────────────────────────────────────────
    fillColor:   'transparent',
    strokeColor: '#888888',
    noFill:      false,
    opacity:     70,
    setFillColor:   (c) => set((s) => { s.fillColor   = c }),
    setStrokeColor: (c) => set((s) => { s.strokeColor = c }),
    setNoFill:      (v) => set((s) => { s.noFill      = v }),
    setOpacity:     (v) => set((s) => { s.opacity     = v }),

    // ─── Cursor ─────────────────────────────────────────────────────────────
    cursorX: 0, cursorY: 0,
    setCursor: (x,y) => set((s) => { s.cursorX=x; s.cursorY=y }),

    // ─── Save / Load ─────────────────────────────────────────────────────────
    currentFilename: null,
    hasUnsavedChanges: false,
    markSaved: (filename) => set((s) => { s.currentFilename = filename; s.hasUnsavedChanges = false }),

    saveToFile: () => {
      const s = useCanvasStore.getState()
      const json = serializeScene(s)
      downloadScene(json, s.currentFilename)
      useCanvasStore.getState().markSaved(s.currentFilename)
    },

    saveAsFile: () => {
      const s = useCanvasStore.getState()
      const json = serializeScene(s)
      const name = prompt('Save as:', s.currentFilename || `warehouse-${new Date().toISOString().slice(0,10)}.wcad`)
      if (!name) return
      const filename = name.endsWith('.wcad') ? name : name + '.wcad'
      downloadScene(json, filename)
      useCanvasStore.getState().markSaved(filename)
    },

    loadFromFile: async () => {
      try {
        const json = await pickFile()
        set((s) => {
          deserializeScene(json, s)
          // Try to extract filename hint from the JSON
          try { const d = JSON.parse(json); s.currentFilename = null } catch {}
          s.hasUnsavedChanges = false
        })
      } catch (err) {
        alert('Could not load file: ' + err.message)
      }
    },

    exportAsPDF: () => {
      const { currentFilename } = useCanvasStore.getState()
      exportToPDF(currentFilename)
    },

    newScene: () => {
      if (useCanvasStore.getState().objects.length > 0) {
        if (!confirm('Start a new scene? Unsaved changes will be lost.')) return
      }
      clearAutoSave()
      set((s) => {
        s.objects      = []
        s.groups       = []
        s.selectedIds  = []
        s.history      = []
        s.historyIndex = -1
        s.currentFilename = null
        s.hasUnsavedChanges = false
        s.zoom = 1; s.panX = 80; s.panY = 80
      })
    },

    // Auto-restore from localStorage on first load
    restoreAutoSave: () => {
      const json = autoLoad()
      if (!json) return false
      try {
        set((s) => { deserializeScene(json, s) })
        return true
      } catch { return false }
    },

    hasAutoSave: () => hasAutoSave(),
  }))
)