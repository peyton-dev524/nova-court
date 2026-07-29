# Precision 7 procedural study

This folder records the dimension-aware, code-only reconstruction used by NOVA COURT's third
selectable shoe. It is a **stylized procedural approximation** inspired by Nike Precision 7;
it is not an exact replica or manufacturing model.

## Evidence

- Official product page and design precedent:
  https://www.nike.com/gb/t/precision-7-basketball-shoes-ypV5QMd3/HJ9153-102
- Official Nike men's size guide:
  https://www.nike.com/gb/size-fit/mens-footwear
- Saved official lateral reference: `reference/nike-precision-7-official.png`
- Intake analysis and quality contract: `analysis.md`
- Strict-validating reconstruction spec: `precision-7-sculpt-spec.json`
- Intake assessment and detail inventory: `pre-spec-assessment.json`,
  `detail-inventory.json`

The official product copy supports a low collar, mesh upper, no-sew overlays, sculpted foam
midsole, molded side mark, and herringbone traction. The visible lateral image supports the
silhouette and exterior layering. The medial face, exact collar interior, outsole depth, and
manufacturing-last width remain inferred.

## Dimension and math contract

- Nike size-guide foot length: 28.3 cm
- Authored outer envelope: 29.8 cm long × 10.8 cm wide × 10.4 cm high
- Browser measurement: 29.8 cm × 11.0 cm × 10.4 cm, within declared tolerance
- Loft rings: `x = cos(theta) × halfWidth(z)`,
  `y = centerY(z) + sin(theta) × halfHeight(z)`
- Toe rocker: `0.002 + (1 - cos(progress × π/2)) × 0.010`
- Footprint: smooth heel/waist/forefoot Gaussian radius fields plus a powered toe taper
- Curved side ribs and mark: measured-radius Catmull–Rom tube sweeps

High-detail runtime cost is 5,228 model triangles, 15 model draw calls, 8 authored materials,
and zero runtime textures or downloaded model dependencies. The complete Shoe Lab scene measured
18 draws in the standard views (16 in outsole view) and sustained 57–60 FPS at 1280 × 720.

## Reproducible Shoe Lab

Serve the repo with `npm run serve`, then open:

`/shoe-lab.html?shoe=precision-7&colorway=photon-navy&view=three-quarter&guides=1`

Available named views are `front`, `three-quarter`, `profile`, `top`, and `outsole`.
Available authored colorways are `summit-silver`, `photon-navy`, and `black-volt`.
The lab also exposes turntable, wireframe, scale-guide, renderer-metric, and save-named-PNG
controls. It remains isolated from the full-body Player Model Lab.

## Final captures

All captures are 1280 × 720, Photon Navy, scale guides enabled, turntable disabled:

- `final/precision-7-photon-navy-front.png`
- `final/precision-7-photon-navy-three-quarter.png`
- `final/precision-7-photon-navy-profile.png`
- `final/precision-7-photon-navy-top.png`
- `final/precision-7-photon-navy-outsole.png`

## Visual review

- Silhouette/proportion: **0.80** — low collar, forefoot width and toe rocker read clearly.
- Component structure: **0.84** — sole, foam, mesh, collar, tongue, laces, overlays and heel
  counter remain distinct and attached.
- Form detail: **0.78** — side ribs, perforation field, rubber wrap and outsole chevrons survive
  the profile/top/outsole views.
- Material surface: **0.75** — rough mesh, satin overlays, foam and rubber separate under neutral
  light without texture dependencies.
- Lighting/camera: **0.86** — all five deterministic views fit the object without clipping;
  the dedicated underside light keeps traction inspectable.
- Overall: **0.80**, decision **continue** for a real-time stylized game asset.

Known mismatches: the molded side mark is intentionally an original speed-line treatment rather
than an exact Nike Swoosh; mesh weave is represented by material response and rib geometry rather
than a texture map; the medial overlay is simplified; the outsole herringbone is lower-density than
the photographed production shoe. These are explicit performance/fidelity tradeoffs, not claims of
exact reconstruction.
