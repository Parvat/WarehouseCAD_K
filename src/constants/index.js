export const TOOLS = {
  SELECT: 'select', MULTI_SELECT: 'multi_select',
  LINE: 'line', ARC: 'arc', CIRCLE: 'circle', SQUARE: 'square',
  TRIANGLE: 'triangle', DIAMOND: 'diamond', STAR: 'star',
  CROSS: 'cross', ARROW: 'arrow', POLYGON: 'polygon',
  L_SHAPE: 'l_shape', T_SHAPE: 't_shape', U_SHAPE: 'u_shape',
  FP_RECT: 'fp_rect', FP_L: 'fp_l', FP_U: 'fp_u', FP_T: 'fp_t',
  TEXT: 'text', PAN: 'pan', FREEHAND: 'freehand',
}

export const UNITS = { FT_IN: 'ft · in', METERS: 'meters', CM: 'cm', MM: 'mm', INCHES: 'inches' }

export const FORKLIFTS = [
  { id: 'mini',      name: 'Mini Electric',       dims: '36" × 70"',  minAisle: '5.5 ft', minAisleFt: 5.5 },
  { id: 'std',       name: 'Std Counterbalance',  dims: '44" × 98"',  minAisle: '10 ft',  minAisleFt: 10  },
  { id: 'reach',     name: 'Reach Truck',         dims: '34" × 78"',  minAisle: '8 ft',   minAisleFt: 8   },
  { id: 'turret',    name: 'Turret Truck',         dims: '38" × 102"', minAisle: '5.5 ft', minAisleFt: 5.5 },
  { id: 'orderpick', name: 'Order Picker',        dims: '33" × 90"',  minAisle: '6 ft',   minAisleFt: 6   },
  { id: 'large',     name: 'Large Gas Forklift',  dims: '52" × 120"', minAisle: '13 ft',  minAisleFt: 13  },
]

export const PALETTE_COLORS = [
  '#ef4444','#f0b429','#22c55e','#4a9eff','#a855f7','#ec4899','#0ea5e9','#14b8a6',
  '#f97316','#84cc16','#06b6d4','#8b5cf6','#e11d48','#d97706','#16a34a','#1d4ed8',
  '#0e0f12','#16181d','#1d2028','#252830','#2a2d36','#555a6a','#8b90a0','#e8eaf0',
]

export const OBJECT_LIBRARY = {
  'Doors': [
    { id: 'garage_door',    label: 'Garage Door',    color: '#4a9eff', w: 12, h: 1   },
    { id: 'warehouse_door', label: 'Warehouse Door', color: '#4a9eff', w: 10, h: 1   },
    { id: 'man_door',       label: 'Man Door',       color: '#4a9eff', w: 3,  h: 0.5 },
    { id: 'fire_door',      label: 'Fire Door',      color: '#ef4444', w: 4,  h: 0.5 },
  ],
  'Windows': [
    { id: 'window',   label: 'Window',   color: '#4a9eff', w: 4, h: 0.25 },
    { id: 'skylight', label: 'Skylight', color: '#4a9eff', w: 4, h: 4    },
  ],
  'Pallet Racks': [
    { id: 'pallet_rack', label: 'Pallet Rack',    color: '#22c55e', w: 8, h: 4  },
    { id: 'drive_in',    label: 'Drive-In Rack',  color: '#22c55e', w: 8, h: 20 },
    { id: 'pushback',    label: 'Push-Back Rack', color: '#22c55e', w: 8, h: 5  },
    { id: 'carton_flow', label: 'Carton Flow',    color: '#f0b429', w: 8, h: 3  },
  ],
  'Cantilever Racks': [
    { id: 'cantilever',     label: 'Cantilever Rack', color: '#a855f7', w: 8, h: 4 },
    { id: 'cantilever_dbl', label: 'Dbl Cantilever',  color: '#a855f7', w: 8, h: 6 },
  ],
  'Warehouse Items': [
    { id: 'column',       label: 'Column',       color: '#f0b429', w: 1,   h: 1    },
    { id: 'post_guard',   label: 'Post Guard',   color: '#f0b429', w: 0.5, h: 1    },
    { id: 'row_spacer',   label: 'Row Spacer',   color: '#8b90a0', w: 4,   h: 0.25 },
    { id: 'bollard',      label: 'Bollard',      color: '#f0b429', w: 0.5, h: 0.5  },
    { id: 'loading_dock', label: 'Loading Dock', color: '#4a9eff', w: 12,  h: 8    },
    { id: 'conveyor',     label: 'Conveyor',     color: '#8b90a0', w: 2,   h: 20   },
    { id: 'mezzanine',    label: 'Mezzanine',    color: '#a855f7', w: 20,  h: 20   },
    { id: 'staging_area', label: 'Staging Area', color: '#f0b429', w: 15,  h: 15   },
  ],
}

export const DEFAULT_LAYERS = [
  { id: 'structural', name: 'Structural',      color: '#4a9eff', visible: true,  locked: false },
  { id: 'racks',      name: 'Racks & Storage', color: '#22c55e', visible: true,  locked: false },
  { id: 'aisles',     name: 'Aisles',          color: '#f0b429', visible: true,  locked: false },
  { id: 'electrical', name: 'Electrical',      color: '#a855f7', visible: false, locked: true  },
  { id: 'labels',     name: 'Labels & Text',   color: '#ef4444', visible: true,  locked: false },
]
