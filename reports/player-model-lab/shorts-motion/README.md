# Basketball shorts motion review

## Reference target

- Default fit: a modern 8-inch-inspired basketball inseam, translated to the stylized rig so the hem lands above the knee.
- Silhouette: relaxed leg openings, longer hem, elastic waistband, contrasting side panels, subtle radial folds, and raised side vents.
- Construction cues: current Nike DNA 6-inch and 8-inch basketball shorts use lightweight mesh, elastic waistbands, and side vents; adidas describes basketball shorts as loose and around knee length for mobility.

Reference pages:

- https://www.nike.com/t/dna-mens-dri-fit-6-basketball-shorts-R65pLfb2
- https://www.nike.com/t/dna-mens-dri-fit-8-basketball-shorts-jVkw9d
- https://www.adidas.com/us/men-basketball-shorts

## Predictable runtime cost

| Per player | Cost |
| --- | ---: |
| Draw calls | 2 |
| Triangles | 608 |
| Dynamic vertices | 320 |
| Capsule collision tests / frame | 320 |
| New textures | 0 |

The cloth system is a bounded procedural deformation, not ray tracing and not an iterative cloth solver. Each shorts vertex uses one corresponding moving thigh-capsule test, followed by a damped hem spring. This keeps the work linear and predictable for 1v1 through 5v5.

## Frame assessment

| Frame | Motion | Result |
| --- | --- | --- |
| `final-frame-01.png` | Idle | Longer hem and relaxed openings read cleanly; no visible jitter. |
| `final-frame-02.png` | Defensive shuffle | Both openings preserve knee clearance and react independently during lateral weight shift. |
| `final-frame-03.png` | Run | Raised thigh pushes the near shell outward; the fabric no longer cuts through the leg. |
| `final-frame-04.png` | Run peak | Hem remains rounded instead of forming the earlier triangular crotch artifact. |
| `final-frame-05.png` | Crossover | Side vent and contrasting panel remain readable with lateral cloth lag. |
| `final-frame-06.png` | Recovery | Springs settle back to neutral without visible overshoot or instability. |

Lab observation at 1280×720: 60 FPS, 76 draws, 8,088 rendered triangles, and 2 textures for the neutral player view. The crossover view adds the basketball and its existing textures, so that frame is not used as the garment-only texture baseline.

## Artifacts

- `basketball-shorts-motion-review.mp4`: 9.8-second browser screencast covering idle, defense, run, crossover, and recovery.
- `final-frame-01.png` through `final-frame-06.png`: reviewed video frames.
- `lab-final.png`: final harness state.
- `gameplay-integration.png`: final 1v1 runtime integration.
- `capture-metadata.json`: frame count, dimensions, sequence, collision model, and cost.
