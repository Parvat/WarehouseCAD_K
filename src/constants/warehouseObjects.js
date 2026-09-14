// ── Warehouse Object Definitions ─────────────────────────────────────────────
// All dimensions in FEET. gridSize = 40px/ft → multiply by 40 for pixels.
//
// snapType:
//   'end'      — snaps to ends of other rack uprights (end-to-end, back-to-back)
//   'wall'     — must anchor to a wall segment
//   'grid'     — snaps to column grid intersections
//   'free'     — standard grid snap only
//   'center'   — snaps center-to-center (bollards, columns)
//
// clearance: { sides, front, back } in ft
//   Invisible halo — turns red if another solid object intrudes within this zone.
//
// variants: array of size presets — user picks before placing

export const SNAP_TYPES = {
  END:    'end',
  WALL:   'wall',
  GRID:   'grid',
  FREE:   'free',
  CENTER: 'center',
}

export const WAREHOUSE_CATEGORIES = [

  // ── 1. Storage & Racking ────────────────────────────────────────────────────
  {
    id: 'storage',
    label: 'Storage & Racking',
    color: '#22c55e',
    objects: [
      {
        id: 'rack_selective',
        type: 'rack_row',
        label: 'Selective Rack',
        description: 'Single bay — add more bays in Properties',
        color: '#22c55e',
        snapType: SNAP_TYPES.END,
        w: 8, h: 3.5,
        variants: [
          { label: '96" beam / 42" deep',  w: 8,   h: 3.5, bays: 1 },
          { label: '144" beam / 42" deep', w: 12,  h: 3.5, bays: 1 },
          { label: '96" beam / 36" deep',  w: 8,   h: 3,   bays: 1 },
          { label: '96" beam / 48" deep',  w: 8,   h: 4,   bays: 1 },
        ],
        meta: { beamLengths: [96,144], depths: [36,42,48], uprightWidth: 3, flueSpace: 6 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',   x: x,       y: y+h/2, role: 'end',  axis: 'x' },
            { id: 'right',  x: x+w,     y: y+h/2, role: 'end',  axis: 'x' },
            { id: 'back',   x: x+w/2,   y: y,     role: 'back', axis: 'y' },
            { id: 'front',  x: x+w/2,   y: y+h,   role: 'back', axis: 'y' },
            { id: 'center', x: x+w/2,   y: y+h/2, role: 'center' },
          ]
        },
      },
      {
        id: 'rack_row',
        type: 'rack_row',
        label: 'Rack Row (multi-bay)',
        description: 'Full row — starter + add-on bays',
        color: '#22c55e',
        snapType: SNAP_TYPES.END,
        w: 42, h: 3.5,
        variants: [
          { label: '3 bays / 42" deep',   w: 24, h: 3.5, bays: 3  },
          { label: '5 bays / 42" deep',   w: 40, h: 3.5, bays: 5  },
          { label: '7 bays / 42" deep',   w: 56, h: 3.5, bays: 7  },
          { label: '10 bays / 42" deep',  w: 80, h: 3.5, bays: 10 },
        ],
        meta: { flueSpace: 6, uprightWidth: 3 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',  x: x,     y: y+h/2, role: 'end',  axis: 'x' },
            { id: 'right', x: x+w,   y: y+h/2, role: 'end',  axis: 'x' },
            { id: 'back',  x: x+w/2, y: y,     role: 'back', axis: 'y' },
            { id: 'front', x: x+w/2, y: y+h,   role: 'back', axis: 'y' },
          ]
        },
      },
      {
        id: 'rack_double_row',
        type: 'rack_double_row',
        label: 'Double Row',
        description: 'Back-to-back racks with 6" flue space',
        color: '#22c55e',
        snapType: SNAP_TYPES.END,
        w: 8, h: 7.5,
        variants: [
          { label: '96" beam / 42"+42"',  w: 8,  h: 7.5, bays: 1 },
          { label: '144" beam / 42"+42"', w: 12, h: 7.5, bays: 1 },
          { label: '96" beam / 36"+36"',  w: 8,  h: 6.5, bays: 1 },
        ],
        meta: { beamLengths: [96, 144], flueSpace: 6, uprightWidth: 3 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',  x: x,     y: y+h/2, role: 'end', axis: 'x' },
            { id: 'right', x: x+w,   y: y+h/2, role: 'end', axis: 'x' },
            { id: 'front', x: x+w/2, y: y,     role: 'front' },
            { id: 'back',  x: x+w/2, y: y+h,   role: 'front' },
          ]
        },
      },
      {
        id: 'rack_cantilever',
        type: 'rack_cantilever',
        label: 'Cantilever Rack',
        description: 'For long items — lumber, pipe, steel',
        color: '#22c55e',
        snapType: SNAP_TYPES.END,
        w: 20, h: 6,
        variants: [
          { label: '1 unit × 36" / double',  towers: 2, armLengthIn: 36, doubleSided: true  },
          { label: '1 unit × 48" / double',  towers: 2, armLengthIn: 48, doubleSided: true  },
          { label: '1 unit × 36" / single',  towers: 2, armLengthIn: 36, doubleSided: false },
          { label: '1 unit × 48" / single',  towers: 2, armLengthIn: 48, doubleSided: false },
          { label: '5 units × 36" / double', towers: 6, armLengthIn: 36, doubleSided: true  },
          { label: '5 units × 48" / double', towers: 6, armLengthIn: 48, doubleSided: true  },
          { label: '5 units × 36" / single', towers: 6, armLengthIn: 36, doubleSided: false },
          { label: '5 units × 48" / single', towers: 6, armLengthIn: 48, doubleSided: false },
        ],
        meta: { armLengths: [36,48,52,60,72], towerWidthIn: 10, spineDepthIn: 4, armThicknessIn: 3 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',  x: x,   y: y+h/2, role: 'end', axis: 'x' },
            { id: 'right', x: x+w, y: y+h/2, role: 'end', axis: 'x' },
          ]
        },
      },
      {
        id: 'rack_drive_in',
        type: 'rack_drive_in',
        label: 'Drive-In Rack',
        description: 'High-density LIFO storage — entry one end only',
        color: '#22c55e',
        snapType: SNAP_TYPES.FREE,
        w: 8.67, h: 20,
        variants: [
          { label: '2-lane / 5-deep',  lanes: 2, palletDeep: 5,  w: 8.67,  h: 20 },
          { label: '3-lane / 5-deep',  lanes: 3, palletDeep: 5,  w: 12.83, h: 20 },
          { label: '4-lane / 5-deep',  lanes: 4, palletDeep: 5,  w: 17,    h: 20 },
          { label: '2-lane / 8-deep',  lanes: 2, palletDeep: 8,  w: 8.67,  h: 32 },
          { label: '3-lane / 8-deep',  lanes: 3, palletDeep: 8,  w: 12.83, h: 32 },
          { label: '4-lane / 10-deep', lanes: 4, palletDeep: 10, w: 17,    h: 40 },
        ],
        meta: { uprightWidth: 4, palletWIn: 40, palletDIn: 48 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'entry', x: x+w/2, y: y+h,   role: 'front' },
            { id: 'left',  x: x,     y: y+h/2, role: 'end', axis: 'x' },
            { id: 'right', x: x+w,   y: y+h/2, role: 'end', axis: 'x' },
          ]
        },
      },
      {
        id: 'rack_drive_through',
        type: 'rack_drive_through',
        label: 'Drive-Through Rack',
        description: 'FIFO storage — entry both ends',
        color: '#22c55e',
        snapType: SNAP_TYPES.FREE,
        w: 8.67, h: 20,
        variants: [
          { label: '2-lane / 5-deep', lanes: 2, palletDeep: 5,  w: 8.67,  h: 20 },
          { label: '3-lane / 5-deep', lanes: 3, palletDeep: 5,  w: 12.83, h: 20 },
          { label: '4-lane / 5-deep', lanes: 4, palletDeep: 5,  w: 17,    h: 20 },
          { label: '2-lane / 8-deep', lanes: 2, palletDeep: 8,  w: 8.67,  h: 32 },
          { label: '3-lane / 8-deep', lanes: 3, palletDeep: 8,  w: 12.83, h: 32 },
        ],
        meta: { uprightWidth: 4, palletWIn: 40, palletDIn: 48 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'entry1', x: x+w/2, y: y,   role: 'front' },
            { id: 'entry2', x: x+w/2, y: y+h, role: 'front' },
            { id: 'left',   x: x,     y: y+h/2, role: 'end', axis: 'x' },
            { id: 'right',  x: x+w,   y: y+h/2, role: 'end', axis: 'x' },
          ]
        },
      },
      {
        id: 'rack_pushback',
        type: 'rack_pushback',
        label: 'Pushback Rack',
        description: '2-5 deep LIFO on inclined cart rails',
        color: '#22c55e',
        snapType: SNAP_TYPES.FREE,
        w: 8.42, h: 8,
        variants: [
          { label: '2-lane / 2-deep', lanes: 2, palletDeep: 2, w: 8.42,  h: 8  },
          { label: '3-lane / 2-deep', lanes: 3, palletDeep: 2, w: 12.5,  h: 8  },
          { label: '2-lane / 3-deep', lanes: 2, palletDeep: 3, w: 8.42,  h: 12 },
          { label: '3-lane / 3-deep', lanes: 3, palletDeep: 3, w: 12.5,  h: 12 },
          { label: '2-lane / 5-deep', lanes: 2, palletDeep: 5, w: 8.42,  h: 20 },
          { label: '3-lane / 5-deep', lanes: 3, palletDeep: 5, w: 12.5,  h: 20 },
        ],
        meta: { uprightWidth: 3, palletWIn: 40, palletDIn: 48 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',  x: x,     y: y+h/2, role: 'end',   axis: 'x' },
            { id: 'right', x: x+w,   y: y+h/2, role: 'end',   axis: 'x' },
            { id: 'front', x: x+w/2, y: y+h,   role: 'front' },
            { id: 'back',  x: x+w/2, y: y,     role: 'back'  },
          ]
        },
      },
      {
        id: 'rack_pallet_flow',
        type: 'rack_pallet_flow',
        label: 'Pallet Flow Rack',
        description: 'Gravity-fed FIFO — roller tyres, loads back picks front',
        color: '#22c55e',
        snapType: SNAP_TYPES.FREE,
        w: 8.42, h: 8,
        variants: [
          { label: '2-lane / 2-deep', lanes: 2, palletDeep: 2, w: 8.42,  h: 8  },
          { label: '3-lane / 2-deep', lanes: 3, palletDeep: 2, w: 12.5,  h: 8  },
          { label: '2-lane / 3-deep', lanes: 2, palletDeep: 3, w: 8.42,  h: 12 },
          { label: '3-lane / 3-deep', lanes: 3, palletDeep: 3, w: 12.5,  h: 12 },
          { label: '4-lane / 4-deep', lanes: 4, palletDeep: 4, w: 16.58, h: 16 },
        ],
        meta: { uprightWidth: 3, palletWIn: 40, palletDIn: 48 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',   x: x,     y: y+h/2, role: 'end',   axis: 'x' },
            { id: 'right',  x: x+w,   y: y+h/2, role: 'end',   axis: 'x' },
            { id: 'load',   x: x+w/2, y: y,     role: 'back'  },
            { id: 'pick',   x: x+w/2, y: y+h,   role: 'front' },
          ]
        },
      },
      {
        id: 'rack_mezzanine',
        type: 'rack_mezzanine',
        label: 'Mezzanine',
        description: 'Multi-level platform with stairs',
        color: '#22c55e',
        snapType: SNAP_TYPES.FREE,
        w: 40, h: 20,
        variants: [
          { label: '40×20ft', w: 40, h: 20 },
          { label: '60×30ft', w: 60, h: 30 },
          { label: '80×40ft', w: 80, h: 40 },
        ],
        meta: { levels: 1, floorLoadPSF: 125 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'rack_shelving',
        type: 'rack_shelving',
        label: 'Shelving Unit',
        description: 'Wire or metal shelving for picking',
        color: '#22c55e',
        snapType: SNAP_TYPES.END,
        w: 10, h: 2,
        variants: [
          { label: '10ft / 24" deep', w: 10, h: 2 },
          { label: '20ft / 24" deep', w: 20, h: 2 },
          { label: '10ft / 36" deep', w: 10, h: 3 },
        ],
        meta: { shelfDepth: 24, shelves: 5 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',  x: x,   y: y+h/2, role: 'end', axis: 'x' },
            { id: 'right', x: x+w, y: y+h/2, role: 'end', axis: 'x' },
          ]
        },
      },
    ],
  },

  // ── 2. Material Handling Equipment ──────────────────────────────────────────
  {
    id: 'mhe',
    label: 'Material Handling',
    color: '#f59e0b',
    objects: [
      {
        id: 'mhe_forklift',
        type: 'mhe_forklift',
        label: 'Forklift',
        description: 'Requires 12–13ft aisle minimum',
        color: '#f59e0b',
        snapType: SNAP_TYPES.FREE,
        w: 4, h: 8,
        clearance: { sides: 1.5, front: 2, back: 0.5 },
        aisleMin: 12,
        variants: [
          { label: 'Standard 4000lb', w: 4, h: 8,  aisleMin: 12 },
          { label: 'Large 8000lb',    w: 5, h: 10, aisleMin: 13 },
        ],
        meta: { capacity: 4000, aisleMin: 12, turningRadius: 7 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'mhe_reach_truck',
        type: 'mhe_reach_truck',
        label: 'Reach Truck',
        description: 'Requires 9–10ft aisle minimum',
        color: '#f59e0b',
        snapType: SNAP_TYPES.FREE,
        w: 3, h: 7,
        clearance: { sides: 1, front: 1.5, back: 0.5 },
        aisleMin: 9,
        variants: [
          { label: 'Standard reach', w: 3, h: 7,  aisleMin: 9  },
          { label: 'Deep reach',     w: 3, h: 8,  aisleMin: 10 },
        ],
        meta: { capacity: 3000, aisleMin: 9, turningRadius: 5 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'mhe_vna',
        type: 'mhe_vna',
        label: 'VNA Turret Truck',
        description: 'Very Narrow Aisle — 5.5–6ft',
        color: '#f59e0b',
        snapType: SNAP_TYPES.FREE,
        w: 2.5, h: 6,
        clearance: { sides: 0.5, front: 1, back: 0.5 },
        aisleMin: 5.5,
        variants: [
          { label: 'VNA Turret', w: 2.5, h: 6, aisleMin: 5.5 },
        ],
        meta: { capacity: 2500, aisleMin: 5.5, turningRadius: 0 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'mhe_pallet_jack',
        type: 'mhe_pallet_jack',
        label: 'Pallet Jack',
        description: 'Manual or electric — 8ft aisle',
        color: '#f59e0b',
        snapType: SNAP_TYPES.FREE,
        w: 2, h: 4,
        clearance: { sides: 0.5, front: 1, back: 0.3 },
        aisleMin: 8,
        variants: [
          { label: 'Manual',   w: 2,   h: 4 },
          { label: 'Electric', w: 2.5, h: 5 },
        ],
        meta: { capacity: 5500, aisleMin: 8 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'mhe_conveyor',
        type: 'mhe_conveyor',
        label: 'Conveyor',
        description: 'Belt or roller — snaps end-to-end',
        color: '#f59e0b',
        snapType: SNAP_TYPES.END,
        w: 30, h: 3,
        variants: [
          { label: '10ft belt',   w: 10, h: 2.5 },
          { label: '20ft belt',   w: 20, h: 2.5 },
          { label: '30ft roller', w: 30, h: 3   },
          { label: '50ft roller', w: 50, h: 3   },
        ],
        meta: { type: 'roller', speed: 50 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'in',  x: x,   y: y+h/2, role: 'end', axis: 'x' },
            { id: 'out', x: x+w, y: y+h/2, role: 'end', axis: 'x' },
          ]
        },
      },
      {
        id: 'mhe_agv',
        type: 'mhe_agv',
        label: 'AGV / Robot',
        description: 'Automated guided vehicle',
        color: '#f59e0b',
        snapType: SNAP_TYPES.FREE,
        w: 4, h: 4,
        clearance: { sides: 1, front: 1.5, back: 1 },
        aisleMin: 6,
        variants: [
          { label: 'Compact AMR',  w: 3, h: 3 },
          { label: 'Standard AGV', w: 4, h: 4 },
          { label: 'Large AGV',    w: 5, h: 5 },
        ],
        meta: { aisleMin: 6, speed: 3 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'mhe_dock_leveler',
        type: 'mhe_dock_leveler',
        label: 'Dock Leveler',
        description: 'Hydraulic plate — anchors to dock wall',
        color: '#f59e0b',
        snapType: SNAP_TYPES.WALL,
        w: 6, h: 6,
        variants: [
          { label: '6×6ft standard', w: 6, h: 6 },
          { label: '7×8ft heavy',    w: 7, h: 8 },
        ],
        meta: { type: 'hydraulic', capacity: 30000 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'wall',   x: x+w/2, y: y,     role: 'wall' },
            { id: 'center', x: x+w/2, y: y+h/2, role: 'center' },
            { id: 'aisle',  x: x+w/2, y: y+h,   role: 'front' },
          ]
        },
      },
    ],
  },

  // ── 3. Structural & Architectural ───────────────────────────────────────────
  {
    id: 'structural',
    label: 'Structural & Architectural',
    color: '#6366f1',
    objects: [
      {
        id: 'column_grid',
        type: 'column_grid',
        label: 'Column Grid',
        description: 'Structural column grid — adjustable bay spacing',
        color: '#6366f1',
        snapType: SNAP_TYPES.GRID,
        w: 0, h: 0,  // size computed from spacingX/spacingY
        variants: [
          { label: "40x40 grid / 12in col", spacingFt: 40, colIn: 12 },
          { label: "40x40 grid / 18in col", spacingFt: 40, colIn: 18 },
          { label: "50x50 grid / 12in col", spacingFt: 50, colIn: 12 },
          { label: "50x50 grid / 18in col", spacingFt: 50, colIn: 18 },
        ],
        meta: { colSizes: [12, 18, 24] },
      },
      {
        id: 'struct_column',
        type: 'struct_column',
        label: 'Column / Pillar',
        description: 'I-beam or concrete — use Grid Array',
        color: '#6366f1',
        snapType: SNAP_TYPES.GRID,
        w: 1, h: 1,
        variants: [
          { label: '12"×12"', w: 1,    h: 1    },
          { label: '16"×16"', w: 1.33, h: 1.33 },
          { label: '24"×24"', w: 2,    h: 2    },
        ],
        meta: { gridSpacing: 40, clearance: 0.17 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'center', x: x+w/2, y: y+h/2, role: 'center' },
            { id: 'n',      x: x+w/2, y: y,      role: 'col_edge', axis: 'y' },
            { id: 's',      x: x+w/2, y: y+h,    role: 'col_edge', axis: 'y' },
            { id: 'e',      x: x+w,   y: y+h/2,  role: 'col_edge', axis: 'x' },
            { id: 'w',      x: x,     y: y+h/2,  role: 'col_edge', axis: 'x' },
          ]
        },
      },
      {
        id: 'struct_loading_dock',
        type: 'struct_loading_dock',
        label: 'Loading Dock Door',
        description: '8–10ft door + leveler — anchors to wall',
        color: '#6366f1',
        snapType: SNAP_TYPES.WALL,
        w: 9, h: 8,
        variants: [
          { label: '8ft door / 6×6 leveler',  w: 8,  h: 8 },
          { label: '9ft door / 6×6 leveler',  w: 9,  h: 8 },
          { label: '10ft door / 7×8 leveler', w: 10, h: 9 },
        ],
        meta: { doorWidth: 9, levelerW: 6, levelerH: 6, doorType: 'roll-up' },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'wall',       x: x+w/2, y: y,     role: 'wall' },
            { id: 'centerline', x: x+w/2, y: y+h,   role: 'aisle_center' },
            { id: 'left',       x: x,     y: y+h/2, role: 'end', axis: 'x' },
            { id: 'right',      x: x+w,   y: y+h/2, role: 'end', axis: 'x' },
          ]
        },
      },
      {
        id: 'struct_partition',
        type: 'struct_partition',
        label: 'Partition Wall',
        description: 'Fire-rated or office partition',
        color: '#6366f1',
        snapType: SNAP_TYPES.END,
        w: 20, h: 0.5,
        variants: [
          { label: '20ft wall', w: 20, h: 0.5 },
          { label: '40ft wall', w: 40, h: 0.5 },
          { label: '60ft wall', w: 60, h: 0.5 },
        ],
        meta: { thickness: 6, fireRated: false },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',  x: x,   y: y+h/2, role: 'end', axis: 'x' },
            { id: 'right', x: x+w, y: y+h/2, role: 'end', axis: 'x' },
          ]
        },
      },
      {
        id: 'struct_egress',
        type: 'struct_egress',
        label: 'Egress Door',
        description: 'Personnel or emergency exit',
        color: '#6366f1',
        snapType: SNAP_TYPES.WALL,
        w: 4, h: 4,
        variants: [
          { label: '3ft door', w: 3, h: 4 },
          { label: '4ft door', w: 4, h: 4 },
        ],
        meta: { swingDir: 'out', fireExit: true },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'wall',   x: x+w/2, y: y,     role: 'wall' },
            { id: 'center', x: x+w/2, y: y+h/2, role: 'center' },
          ]
        },
      },
      {
        id: 'struct_window',
        type: 'struct_window',
        label: 'Window / Skylight',
        description: 'Wall opening for light/ventilation',
        color: '#6366f1',
        snapType: SNAP_TYPES.WALL,
        w: 6, h: 0.5,
        variants: [
          { label: '4ft window',   w: 4, h: 0.5 },
          { label: '6ft window',   w: 6, h: 0.5 },
          { label: '8ft skylight', w: 8, h: 8   },
        ],
        meta: { glazed: true },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',  x: x,   y: y+h/2, role: 'end', axis: 'x' },
            { id: 'right', x: x+w, y: y+h/2, role: 'end', axis: 'x' },
          ]
        },
      },
    ],
  },

  // ── 4. Safety & Protection ──────────────────────────────────────────────────
  {
    id: 'safety',
    label: 'Safety & Protection',
    color: '#ef4444',
    objects: [
      {
        id: 'safety_bollard',
        type: 'safety_bollard',
        label: 'Bollard',
        description: 'Steel post — rack/corner protection',
        color: '#ef4444',
        snapType: SNAP_TYPES.CENTER,
        w: 0.5, h: 0.5,
        variants: [
          { label: '4" pipe', w: 0.33, h: 0.33 },
          { label: '6" pipe', w: 0.5,  h: 0.5  },
          { label: '8" pipe', w: 0.67, h: 0.67 },
        ],
        meta: { diameter: 6, height: 42, filled: true },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'safety_guardrail',
        type: 'safety_guardrail',
        label: 'Guardrail',
        description: 'Pedestrian / forklift separation',
        color: '#ef4444',
        snapType: SNAP_TYPES.END,
        w: 10, h: 0.33,
        variants: [
          { label: '10ft run', w: 10, h: 0.33 },
          { label: '20ft run', w: 20, h: 0.33 },
          { label: '40ft run', w: 40, h: 0.33 },
        ],
        meta: { height: 42, postSpacing: 24 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',  x: x,   y: y+h/2, role: 'end', axis: 'x' },
            { id: 'right', x: x+w, y: y+h/2, role: 'end', axis: 'x' },
          ]
        },
      },
      {
        id: 'safety_rack_guard',
        type: 'safety_rack_guard',
        label: 'Rack Protector',
        description: 'Floor-mounted upright shield',
        color: '#ef4444',
        snapType: SNAP_TYPES.CENTER,
        w: 0.67, h: 1.5,
        variants: [
          { label: 'Single', w: 0.67, h: 1.5 },
          { label: 'Double', w: 1.5,  h: 1.5 },
        ],
        meta: { style: 'wrap-around' },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'safety_netting',
        type: 'safety_netting',
        label: 'Safety Netting',
        description: 'Back-of-rack fall barrier',
        color: '#ef4444',
        snapType: SNAP_TYPES.END,
        w: 8, h: 0.17,
        variants: [
          { label: '8ft',  w: 8,  h: 0.17 },
          { label: '16ft', w: 16, h: 0.17 },
        ],
        meta: {},
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'left',  x: x,   y: y+h/2, role: 'end', axis: 'x' },
            { id: 'right', x: x+w, y: y+h/2, role: 'end', axis: 'x' },
          ]
        },
      },
      {
        id: 'safety_sign',
        type: 'safety_sign',
        label: 'Aisle Sign / Marking',
        description: 'Aisle marker, floor tape, exit sign',
        color: '#ef4444',
        snapType: SNAP_TYPES.FREE,
        w: 2, h: 2,
        variants: [
          { label: 'Aisle marker',  w: 2, h: 2   },
          { label: 'Floor marking', w: 4, h: 0.5 },
          { label: 'Exit sign',     w: 2, h: 2   },
        ],
        meta: {},
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
    ],
  },

  // ── 5. Utilities & Facilities ───────────────────────────────────────────────
  {
    id: 'utilities',
    label: 'Utilities & Facilities',
    color: '#4a9eff',
    objects: [
      {
        id: 'util_charging',
        type: 'util_charging',
        label: 'Charging Station',
        description: 'Battery charging area for electric MHE',
        color: '#4a9eff',
        snapType: SNAP_TYPES.WALL,
        w: 8, h: 6,
        variants: [
          { label: '2-charger', w: 8,  h: 6 },
          { label: '4-charger', w: 16, h: 6 },
          { label: '6-charger', w: 24, h: 6 },
        ],
        meta: { chargers: 2, voltage: 480 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [
            { id: 'wall',   x: x+w/2, y: y,     role: 'wall' },
            { id: 'center', x: x+w/2, y: y+h/2, role: 'center' },
          ]
        },
      },
      {
        id: 'util_hvac',
        type: 'util_hvac',
        label: 'HVAC / HVLS Fan',
        description: 'Industrial ceiling fan or ductwork',
        color: '#4a9eff',
        snapType: SNAP_TYPES.GRID,
        w: 4, h: 4,
        variants: [
          { label: '16ft HVLS fan', w: 4, h: 4 },
          { label: '24ft HVLS fan', w: 6, h: 6 },
          { label: 'Rooftop HVAC',  w: 8, h: 6 },
        ],
        meta: { diameter: 16, type: 'HVLS' },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'util_sprinkler',
        type: 'util_sprinkler',
        label: 'Sprinkler Head',
        description: 'Fire suppression — grid every 10–15ft',
        color: '#4a9eff',
        snapType: SNAP_TYPES.GRID,
        w: 1.5, h: 1.5,
        variants: [
          { label: 'ESFR head', w: 1.5, h: 1.5 },
        ],
        meta: { spacing: 12, type: 'ESFR' },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'util_lighting',
        type: 'util_lighting',
        label: 'High-Bay Light',
        description: 'LED fixture — one per aisle bay',
        color: '#4a9eff',
        snapType: SNAP_TYPES.GRID,
        w: 4, h: 1,
        variants: [
          { label: '100W LED',   w: 2, h: 1 },
          { label: '200W LED',   w: 4, h: 1 },
          { label: '400W array', w: 8, h: 1 },
        ],
        meta: { wattage: 200, lumens: 26000, mountHeight: 25 },
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
      {
        id: 'util_office_desk',
        type: 'util_office_desk',
        label: 'Office Desk',
        description: 'Manager workstation',
        color: '#4a9eff',
        snapType: SNAP_TYPES.FREE,
        w: 6, h: 3,
        variants: [
          { label: 'Single desk',    w: 6,  h: 3  },
          { label: 'L-shaped desk',  w: 8,  h: 6  },
          { label: '4-desk cluster', w: 12, h: 12 },
        ],
        meta: {},
        getSnapPoints: (obj) => {
          const { x, y, width: w, height: h } = obj
          return [{ id: 'center', x: x+w/2, y: y+h/2, role: 'center' }]
        },
      },
    ],
  },
]

// ── Quick lookup by type ──────────────────────────────────────────────────────
export const WAREHOUSE_OBJECT_MAP = {}
WAREHOUSE_CATEGORIES.forEach(cat => {
  cat.objects.forEach(obj => {
    WAREHOUSE_OBJECT_MAP[obj.type] = obj
  })
})

// Types with clearance halos (MHE that need aisle validation)
export const MHE_TYPES = new Set(
  Object.values(WAREHOUSE_OBJECT_MAP)
    .filter(o => o.clearance)
    .map(o => o.type)
)

// Types that snap end-to-end (racks, conveyors, guardrails, walls)
export const END_SNAP_TYPES = new Set(
  Object.values(WAREHOUSE_OBJECT_MAP)
    .filter(o => o.snapType === 'end')
    .map(o => o.type)
)