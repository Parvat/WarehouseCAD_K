# Studio mockups — source of truth for the UI

Values are in the inline styles. Studio.dc.html holds every Studio screen; the other Studio*.dc.html files only pick a state.

| File | Screen | panel value |
|---|---|---|
| Studio.dc.html | C1 plan, rack selected | props |
| StudioElev.dc.html | C2 Elevations list | elev |
| StudioEdit.dc.html | C3 New elevation | edit |
| StudioGen.dc.html | C4 Regenerate | gen |
| StudioCheck.dc.html | C5 Check layout | check |
| StudioZone.dc.html | C6 Zone selected + undo notice | zone |
| StudioEmpty.dc.html | C7 Empty plan | empty |
| StudioRowGroup.dc.html | C8 Row group | rowgroup |
| StudioSplit.dc.html | C9 Split | split |
| StudioFill.dc.html | C10 Fill racking | fill |
| StudioSettings.dc.html | C11 Project settings | settings |
| StudioRules.dc.html | C12 Rules | rules |
| StudioExport.dc.html | C13 Export with an error | export |
| StudioMenu.dc.html | C14 Layout menu | menu |
| Start.dc.html | C15 New project | — |
| Hub.dc.html | C16 Hub | — |
| Login.dc.html | C17 Sign in | — |
| PlanDetail.dc.html | C18 Plan drawing close-up: racks, labels, lost positions, uprights | — |
| Objects.dc.html | C19 Canvas objects: zones (with doors), structure | — |
| Icons.dc.html | C20 Icons: D box style for every icon (objects + tools). B isometric = 3D/illustrations only | — |

Inside Studio.dc.html each screen sits in an `<sc-if value="{{pX}}">` block; renderVals() maps the panel value to those flags.
**The .dc.html files are source, not web pages.** Opened directly in a browser they look broken (blank areas, empty racks) because they need the design-canvas runtime. Read them for exact values; look at the PNGs to see the screens.

Screenshots: design/studio/png/<File>.png — every screen rendered at full size (1440x900; Objects and Icons 1440x1320). Use these for the side-by-side check.
The rack plan inside C1–C14 is a simplified picture; drawing rules come from C18, C19 and STUDIO.md. All icons come from C20; icons drawn inside C1–C14 are placeholders to be replaced by the C20 set.
