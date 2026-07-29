# Arc Run presentation QA

Captured at 1280 × 720 from `http://127.0.0.1:4199/?qa=1&rev=7`.
The five images use the deterministic QA rack jump and camera snap; normal
gameplay still interpolates between the same endpoints.

## Research basis

- NBA.com, [All-Star 2023: Starry 3-Point Contest brings new
  twists](https://www.nba.com/news/all-star-2023-3-point-contest-analysis):
  five racks spaced around the three-point line, five balls per rack, 22 ft
  corner threes, and 23 ft 9 in above-the-break threes.
- Minnesota Timberwolves / NBA.com, [2024 3-Point Contest format and
  results](https://www.nba.com/timberwolves/news/karl-anthony-towns-2024-3-point-contest-tv-channel-format-updated-results):
  current-format corroboration.

NBA imagery was used only as composition reference. No NBA image is shipped as
a game asset.

## Authored geometry

- Unit conversion: `feet × 0.3048`.
- Corner line: `22 ft = 6.7056 m`; shooter `x = ±6.7056`.
- Above break: `23.75 ft = 7.239 m`.
- Wing station: `x = ±sin(45°) × 7.239`, `z = rimZ + cos(45°) × 7.239`.
- Top station: `x = 0`, `z = rimZ + 7.239`.
- The compact game court requires corner station centers to sit `0.48 m`
  up-court from the rim center. Their radial rim distance is therefore
  `sqrt(6.7056² + 0.48²) = 6.7228 m`, only `+0.0172 m` beyond 22 ft.
- Rack forward is normalized `(hoop - rack)`; its row tangent is the exact
  perpendicular `(-forward.z, forward.x)`. The measured forward-to-hoop dot is
  `1.0` and tangent-to-forward dot is `0.0` at all five racks.
- Rack center is `1.05 m` from the shooter, leaving the nearest ball about
  `0.48 m` away. A raised dark rear rail, lower cyan front rail, shelf slope,
  and rear wheels make rack front/back visually testable.

## Camera contract

The named `arc-run` camera starts from normalized shooter-to-hoop direction.
Its target is over the player's shoulder toward the active rim. Regular
transitions use exponential interpolation; QA can snap to the exact same
endpoint. Arena-safe camera bounds are `x = ±6.98 m`, so corner views use a
tight over-shoulder crop instead of placing the camera behind the venue wall.

| Rack | Shooter `(x,z)` | Camera `(x,y,z)` | FOV | rack→hoop dot | player-facing dot | actual camera dot |
|---|---:|---:|---:|---:|---:|---:|
| Left corner | `(-6.7056,-5.2200)` | `(-6.9800,2.1500,-4.6189)` | `57.2002` | `1.0` | `1.0` | `0.8665` |
| Left wing | `(-5.1187,-0.5813)` | `(-6.9800,2.1500,0.4598)` | `50.9520` | `1.0` | `1.0` | `0.9925` |
| Top | `(0,1.5390)` | `(0.5800,2.1500,4.6890)` | `47.0` | `1.0` | `1.0` | `0.9949` |
| Right wing | `(5.1187,-0.5813)` | `(6.9800,2.1500,0.4598)` | `50.9520` | `1.0` | `1.0` | `0.9925` |
| Right corner | `(6.7056,-5.2200)` | `(6.9800,2.1500,-4.6189)` | `57.2002` | `1.0` | `1.0` | `0.8665` |

The corner camera dot is lower because the aim is deliberately split between
the near shoulder and the rim so both remain in the wide frame.

## Reproduce

1. Run `npm run serve`.
2. Open `http://127.0.0.1:4174/?qa=1`, enter Arc Run, and wait for live play.
3. For rack index `0` through `4`, run:

```js
window.__NOVA_QA__.jumpThreePointContest(rackIndex, 0, false);
window.__NOVA_QA__.snapThreePointCamera();
window.__NOVA_QA__.threePointContest();
```

The last call returns player, hoop, rack, direction dots, camera endpoint, FOV,
and renderer rack snapshot. `jumpThreePointContest` can move backward or
forward to any rack/ball and preserves the 25-ball contest sequence.

## Captures

- `rack-01-left-corner.png`
- `rack-02-left-wing.png`
- `rack-03-top.png`
- `rack-04-right-wing.png`
- `rack-05-right-corner.png`

Honest limitation: the regulation 22 ft corner x coordinate leaves only
`0.2744 m` between the shooter and the arena-safe camera bound. Those two
captures are intentionally tighter and more lateral than the three
above-the-break views; moving farther directly behind would put the camera
inside the arena wall.
