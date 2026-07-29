# Arc Run radial rack orientation and spacing

## Captures

| Rack | Screenshot | Debug route |
| --- | --- | --- |
| Left corner | `rack-left-corner-radial.png` | `/index.html?qa=1&captureHeight=720&arcRunCapture=rack-left-corner` |
| Left wing | `rack-left-wing-radial.png` | `/index.html?qa=1&captureHeight=720&arcRunCapture=rack-left-wing` |
| Top of key | `top-key-vertical-normal-to-money.png` | `/index.html?qa=1&captureHeight=720&arcRunCapture=rack-top` |
| Right wing | `rack-right-wing-radial.png` | `/index.html?qa=1&captureHeight=720&arcRunCapture=rack-right-wing` |
| Right corner | `rack-right-corner-radial.png` | `/index.html?qa=1&captureHeight=720&arcRunCapture=rack-right-corner` |

All captures use the production behind-player Arc Run camera at rack ball 1.

## Spacing calculation

The authored position of each rack is checked as an oriented footprint rather
than as a single center point:

`halfExtent(axis) = |rackAxis| × 0.775 m + |sideAxis| × 0.23 m`

The footprint is clamped to the 15 m × 14 m half court with a 0.06 m boundary
margin. The player stands 0.82 m from the rack center. Subtracting the 0.23 m
rack half-width and 0.32 m player radius leaves at least 0.20 m of body
clearance. Every ball must also remain within the 1.10 m pickup reach.

| Rack | Boundary clearance | Player-body clearance | Furthest pickup | Clamp adjustment |
| --- | ---: | ---: | ---: | ---: |
| Left corner | 0.060 m | 0.262 m | 1.054 m | 0.114 m |
| Left wing | 2.250 m | 0.270 m | 0.990 m | 0.000 m |
| Top of key | 4.686 m | 0.270 m | 0.990 m | 0.000 m |
| Right wing | 2.250 m | 0.270 m | 0.990 m | 0.000 m |
| Right corner | 0.060 m | 0.262 m | 1.054 m | 0.114 m |

The camera may frame the larger rendered apron (9.05 m × 8.2 m half extents),
but rack collision and placement calculations continue to use the actual
7.5 m × 7 m gameplay court bounds.

## Verified geometry and visual QA

- Every rack's long axis follows its shooter-to-hoop line.
- Ball order advances from the hoop-facing/top end toward the
  down-court/bottom end.
- The four classic orange balls begin at the top end and the fifth
  red/white/blue money ball sits at the bottom end on all five racks.
- Every complete rack, player, hoop, and HUD is visible from its gameplay
  camera.
- Browser console: zero warnings and zero errors in all five captures.
