# NOVA COURT Stadium / Gym Lab — Final QA

## Reference and license

The compact venue shell is a procedural, stylized reconstruction informed by
**Montgomery High School's original basketball gym**, San Diego, photographed by
Issac I Navarro on 14 January 2025. The source page identifies a 4,080 × 3,060
original and dedicates the photograph to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

- Source page: https://commons.wikimedia.org/wiki/File:Montgomery_High_School%27s_original_basketball_gym.jpg
- Local review-only copy: `../reference/montgomery-gym-reference.jpg`
- Runtime use: none. The photo is not shipped as a texture or model input.

Visible reference cues reproduced in code are the low cream concrete shell,
cool blue-gray lower panels, narrow red/blue graphic bands, centered Montgomery
identity panel, paired dark entry doors, and compact institutional scale.
The reference photograph shows the exterior rather than the court interior, so
the maple floor, bleachers, scoreboard, rafters, lights, hoops, and interior
wall layout are intentionally authored extrapolations rather than claims of an
exact interior survey. The reconstruction also omits the reference mascot art,
posters, exterior trash bin, sidewalk, landscaping, and photographic wear.
No crowd is included because none is visible in the cited reference.

Court proportions follow Draper's high-school court reference:
https://www.draperinc.com/documentdownload.aspx?file=Gym_Court_Design_Rules-HS_0916.pdf&path=images%2FCatalogs%2FWhitePapers

- Court: `84 ft × 50 ft = 25.6032 m × 15.24 m`
- Rim height: `10 ft × 0.3048 = 3.048 m`
- Rim inside diameter: `18 in × 0.0254 = 0.4572 m`; modeled radius `0.2286 m`
- Center circle radius: `6 ft × 0.3048 = 1.8288 m`
- High-school three-point radius: `19 ft 9 in = 6.0198 m`
- Line width: `2 in × 0.0254 = 0.0508 m`

## Deterministic capture route

Viewport for every capture: **1280 × 720**. Final views use scale guides off.

Base URL:

`http://127.0.0.1:4193/gym-lab.html?quality=high&guides=0&view=<view>`

Named view values and files:

- `reference-baseline` → `gym-reference-baseline-high.png`
- `sideline` → `gym-sideline-high.png`
- `bleachers` → `gym-bleachers-high.png`
- `rafters` → `gym-rafters-high.png`
- `scoreboard` → `gym-scoreboard-high.png`
- `court-wide` → `gym-court-wide-high.png`

Loading overlay:

`http://127.0.0.1:4193/gym-lab.html?view=reference-baseline&quality=high&guides=0&loading=1`

→ `gym-loading-overlay-active.png`

The equivalent deterministic hook is exposed as `window.__NOVA_GYM_LAB__`:

```js
window.__NOVA_GYM_LAB__.setView("scoreboard");
window.__NOVA_GYM_LAB__.setQuality("medium");
window.__NOVA_GYM_LAB__.setGroup("gym-bleachers", false);
window.__NOVA_GYM_LAB__.loadingOverlay(true, 0.72, "optional");
window.__NOVA_GYM_LAB__.snapshot();
```

The hook reports scene ID, phase, progress, loaded and visible group IDs, load
errors, quality budget, and live renderer calls/triangles/geometries/textures.

## Measured browser budgets

Chrome, 1280 × 720, named baseline view after stabilization:

| Tier | Calls | Triangles | Geometries | Textures | GLB payload |
| --- | ---: | ---: | ---: | ---: | ---: |
| Low | 34 | 2,506 | 33 | 2 | 0 B |
| Medium | 34 | 3,010 | 33 | 2 | 0 B |
| High | 34 | 3,466 | 33 | 2 | 0 B |

All tiers are under their declared ceilings. Optional detail cost is dominated
by instanced bleacher seats and rafters, so lower tiers reduce triangles without
creating more draw calls, geometries, or textures. The high tier is well under
the target of 140 calls, 55k triangles, 220 geometries, and 12 textures.

Three consecutive high-tier reload/dispose cycles held steady at **34 calls,
3,466 triangles, 33 geometries, and 2 textures**. This is also covered by the
registry ownership/reset unit test.

## Loading behavior and limitations

Loading is divided into `shell`, `required`, and `optional` phases with monotonic
progress. Shell, court, and hoops have synchronous procedural fallbacks.
Cancellation increments a scene token; stale async completions are disposed
instead of being attached. Loaded IDs are reused idempotently. Scene release can
hide shared roots for reuse or dispose owned GPU resources for a true unload.
Game mode startup now reports the same real phases and removes the former
artificial boot delays.

Current limitations:

- The exterior reference does not reveal the actual Montgomery interior.
- Court line work uses lightweight WebGL lines; line width is mathematically
  documented but browser rasterization remains approximately one device pixel.
- Seats are compact bleacher planks rather than individually molded chairs.
- There is no crowd, animated scoreboard clock, acoustic simulation, or GLB
  payload; those remain optional future detail groups.
- The lab uses restrained procedural materials and two canvas sign textures,
  prioritizing fast reset and deterministic rendering over photorealism.
