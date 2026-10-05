// The layout from the hand check on canvas2-wall-pockets (warehouse-2026-10-05.wcad, saved from the app):
// a 500 × 250 building with a column grid, an office and a washroom against the top wall, a custom
// area on the bottom wall, and the racking area as saved — its box 2.89' short of the left wall and
// 1.37' short of the top, vertical, and its stored pattern. No racks: tests fill it themselves.
export const REAL_LAYOUT = [
 {
  "id": "OZrymdM6T6CR5kclbow_d",
  "type": "fp_rect",
  "x": -10000,
  "y": -5000,
  "width": 20000,
  "height": 10000,
  "fill": "#ffffff",
  "stroke": "#333333",
  "strokeWidth": 10,
  "wallThicknessFt": 0.25,
  "fpStemW": 0.3,
  "fpStemH": 0.3,
  "fpBarH": 0.3,
  "fpTBarHL": 0.3,
  "fpTBarHR": 0.3,
  "fpTStemL": 0.325,
  "fpTStemR": 0.675,
  "fpCrossLXT": 0.325,
  "fpCrossRXT": 0.675,
  "fpCrossLXB": 0.325,
  "fpCrossRXB": 0.675,
  "fpCrossTYR": 0.325,
  "fpCrossBYR": 0.675,
  "fpCrossTYL": 0.325,
  "fpCrossBYL": 0.675,
  "fpUWallT": 0.28,
  "fpUOpenH": 0.62,
  "labelFontSize": 1000,
  "showWallLabel": false,
  "layerId": "building",
  "opacity": 1,
  "rotation": 0,
  "noFill": false,
  "label": "",
  "fpVerts": [
   {
    "x": -10000,
    "y": -5000
   },
   {
    "x": 10000,
    "y": -5000
   },
   {
    "x": 10000,
    "y": 5000
   },
   {
    "x": -10000,
    "y": 5000
   }
  ],
  "generated": true
 },
 {
  "id": "1uYue4jpZQSbHnv0IK8ZX",
  "layerId": "columns",
  "strokeWidth": 1.5,
  "opacity": 1,
  "rotation": 0,
  "noFill": false,
  "type": "column_grid",
  "label": "Column Grid",
  "x": -8000,
  "y": -2840,
  "width": 16040,
  "height": 6520,
  "spacingX": [
   2000,
   2000,
   2000,
   2000,
   2000,
   2000,
   2000,
   2000
  ],
  "spacingY": [
   2160,
   2160,
   2160
  ],
  "colSizeIn": 12,
  "columnW": 40,
  "columnH": 40,
  "showGrid": true,
  "wallAttached": false,
  "fill": "#6366f122",
  "stroke": "#6366f1",
  "parentId": "OZrymdM6T6CR5kclbow_d"
 },
 {
  "id": "W3yJo2-nspQXJM2M-vlbz",
  "layerId": "zones",
  "strokeWidth": 1.5,
  "opacity": 1,
  "rotation": 0,
  "noFill": false,
  "type": "zone_office",
  "x": 5330.253044937764,
  "y": -4990,
  "width": 3012.0206387291464,
  "height": 3353.797955590643,
  "fill": "#7c3aed22",
  "stroke": "#7c3aed",
  "label": "Office",
  "uprightWidth": 3,
  "parentId": "OZrymdM6T6CR5kclbow_d"
 },
 {
  "id": "InRB8gr42UMVXaaKmYlrn",
  "layerId": "zones",
  "strokeWidth": 1.5,
  "opacity": 1,
  "rotation": 0,
  "noFill": false,
  "type": "zone_custom",
  "x": -1484.8733233979135,
  "y": 4566.204669647292,
  "width": 1200,
  "height": 423.79533035270833,
  "fill": "#64748b22",
  "stroke": "#64748b",
  "label": "Custom area",
  "uprightWidth": 3,
  "parentId": "OZrymdM6T6CR5kclbow_d"
 },
 {
  "id": "LU6Cz0UPWxQWcfh2RXxmy",
  "layerId": "zones",
  "strokeWidth": 1.5,
  "opacity": 1,
  "rotation": 0,
  "noFill": false,
  "type": "zone_washroom",
  "x": 4504.797120341733,
  "y": -4990,
  "width": 800,
  "height": 1298.584202682563,
  "fill": "#0284c722",
  "stroke": "#0284c7",
  "label": "Washroom",
  "uprightWidth": 3,
  "parentId": "OZrymdM6T6CR5kclbow_d"
 },
 {
  "id": "8aJOMQQy02klJIK1pnx4k",
  "type": "racking_area",
  "label": "Racking area",
  "x": -9874.22569611373,
  "y": -4935.247888924383,
  "width": 19864.225696113732,
  "height": 9925.247888924383,
  "rotation": 0,
  "parentId": "OZrymdM6T6CR5kclbow_d",
  "layerId": "racking",
  "settings": {
   "orientation": "vertical",
   "beamIn": 96,
   "palletWIn": 40,
   "palletDIn": 48,
   "mhe": "reach",
   "aisleFt": 10.5,
   "maxRunFt": 150,
   "levels": 4
  },
  "anchor": {
   "x": "l",
   "y": "t"
  },
  "pattern": {
   "vert": true,
   "units": [
    {
     "s0": -251.10564240284324,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 1
    },
    {
     "s0": -232.85564240284324,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 2
    },
    {
     "s0": -214.60564240284324,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 3
    },
    {
     "s0": -191.5,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 4
    },
    {
     "s0": -173.25,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 5
    },
    {
     "s0": -154,
     "d": 8,
     "type": "rack_double_row",
     "flueIn": 12,
     "row": 6
    },
    {
     "s0": -135.5,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 7
    },
    {
     "s0": -117.25,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 8
    },
    {
     "s0": -99,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 9
    },
    {
     "s0": -80.75,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 10
    },
    {
     "s0": -62.5,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 11
    },
    {
     "s0": -41.5,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 12
    },
    {
     "s0": -23.25,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 13
    },
    {
     "s0": -4,
     "d": 8,
     "type": "rack_double_row",
     "flueIn": 12,
     "row": 14
    },
    {
     "s0": 14.500000000000028,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 15
    },
    {
     "s0": 32.75000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 16
    },
    {
     "s0": 51.00000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 17
    },
    {
     "s0": 69.25000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 18
    },
    {
     "s0": 87.50000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 19
    },
    {
     "s0": 108.50000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 20
    },
    {
     "s0": 126.75000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 21
    },
    {
     "s0": 146.00000000000003,
     "d": 8,
     "type": "rack_double_row",
     "flueIn": 12,
     "row": 22
    },
    {
     "s0": 164.50000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 23
    },
    {
     "s0": 182.75000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 24
    },
    {
     "s0": 201.00000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 25
    },
    {
     "s0": 219.25000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 26
    },
    {
     "s0": 237.50000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 27
    },
    {
     "s0": 255.75000000000003,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 28
    },
    {
     "s0": 274,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 29
    },
    {
     "s0": 292.25,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 30
    },
    {
     "s0": 310.5,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 31
    },
    {
     "s0": 328.75,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 32
    },
    {
     "s0": 347,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 33
    },
    {
     "s0": 365.25,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 34
    },
    {
     "s0": 383.5,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 35
    },
    {
     "s0": 401.75,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 36
    },
    {
     "s0": 420,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 37
    },
    {
     "s0": 446.25,
     "d": 3.5,
     "type": "rack_row",
     "flueIn": 9,
     "row": 38
    },
    {
     "s0": -269.3556424028433,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 39
    },
    {
     "s0": -287.6056424028433,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 40
    },
    {
     "s0": -305.8556424028433,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 41
    },
    {
     "s0": -324.1056424028433,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 42
    },
    {
     "s0": -342.3556424028433,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 43
    },
    {
     "s0": -360.6056424028433,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 44
    },
    {
     "s0": -378.8556424028433,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 45
    },
    {
     "s0": -397.1056424028433,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 46
    },
    {
     "s0": -415.3556424028433,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 47
    },
    {
     "s0": -433.6056424028433,
     "d": 7.75,
     "type": "rack_double_row",
     "flueIn": 9,
     "row": 48
    },
    {
     "s0": -449.75,
     "d": 3.5,
     "type": "rack_row",
     "flueIn": 9,
     "row": 49
    }
   ],
   "pieces": [
    {
     "r0": -156.38119722310958,
     "n": 18,
     "sec": 1
    },
    {
     "r0": 9,
     "n": 18,
     "sec": 2
    },
    {
     "r0": 166.74999999999997,
     "n": 18,
     "sec": 3
    },
    {
     "r0": 324.5,
     "n": 18,
     "sec": 4
    },
    {
     "r0": -314.13119722310955,
     "n": 18,
     "sec": 5
    },
    {
     "r0": -471.88119722310955,
     "n": 18,
     "sec": 6
    }
   ],
   "beamIn": 96,
   "upIn": 3,
   "depthIn": 42,
   "flueIn": 9,
   "aisleFt": 10.5,
   "travelFt": 8,
   "palletWIn": 40,
   "palletDIn": 48,
   "levels": 4,
   "dirS": 1,
   "runDir": 1,
   "mhe": "reach"
  },
  "placed": {}
 }
]
