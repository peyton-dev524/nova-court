# Precision 7 procedural study — intake analysis

## Reference and suitability

- Official product page: https://www.nike.com/gb/t/precision-7-basketball-shoes-ypV5QMd3/HJ9153-102
- Official image: `reference/nike-precision-7-official.png` (400 × 400)
- Official size guide: https://www.nike.com/gb/size-fit/mens-footwear
- Intake verdict: **conditional pass**. The official lateral view has a clear silhouette and
  material/color separation, but it does not reveal the medial face or exact outsole depth.
- Intended use: real-time browser game footwear, procedural and animation-ready.
- Fidelity statement: this is a stylized approximation inspired by the Nike Precision 7,
  not an exact replica, manufacturing model, or downloaded Nike asset.

## Layered observation

1. **Identification:** low-collar adult basketball shoe; object-domain compound assembly.
2. **Overall form:** bilaterally near-symmetric foot volume with a wide forefoot, narrower waist,
   rounded heel, low collar, and a toe rocker that rises above the outsole datum.
3. **Macro / meso / micro:** outsole + sculpted foam midsole + mesh upper; tongue, collar,
   eyestay, heel counter, lateral overlay and toe guard; laces, perforations, layered side ribs,
   and herringbone traction.
4. **Spatial relationships:** the upper overlaps the midsole; the heel counter wraps the rear
   quarter; the tongue sits beneath crossed laces; the side overlay rides proud of the mesh upper.
5. **Materials:** matte rubber outsole, higher-value satin foam, rough woven mesh, no-sew synthetic
   overlays, and a slightly lower-roughness molded side mark.
6. **Color:** the official HJ9153-102 reference is white / pale grey / metallic silver with a dark
   outsole contact strip. Three authored game colorways preserve those zones.
7. **Identity features:** low plush collar, long eyestay, split sculpted midsole sidewall, curved
   forefoot rubber wrap, layered side lines, molded lateral mark, and herringbone traction.
8. **Uncertainty:** the medial overlay, collar interior, hidden tread, and exact width/height are
   inferred from bilateral footwear construction and the official text.

## Dimension contract

The game rig uses a 0.283 m foot-length reference from the Nike size chart and a 0.298 m outer
shoe length, allowing 15 mm total toe/heel construction allowance. The procedural bounding target
is 0.298 m long × 0.108 m wide × 0.104 m high. Width and height are inferred to fit the existing
player scale; the source does not publish manufacturing last dimensions.

The section functions are dimension-driven:

- lateral section: `x = cos(theta) × halfWidth(z)`
- vertical section: `y = centerY(z) + sin(theta) × halfHeight(z)`
- toe rocker: `h = 0.002 + (1 - cos(t × π/2)) × 0.010`
- forefoot width: an ellipse-weighted blend across normalized length
- side ribs and molded mark: Catmull–Rom curve sweeps with measured radii

## Quality contract

The model is acceptable when it:

- stays within ±3 mm length, ±2.5 mm width, and ±3 mm height of the dimension contract;
- preserves left/right bounding symmetry and continuous section/rocker math;
- clearly separates outsole, sculpted midsole, mesh upper, collar/tongue, lacing, side overlay,
  heel counter, molded mark, perforations, and traction;
- exposes all visible assemblies as named, pickable runtime parts;
- renders the high-detail shoe below 16,000 triangles, 24 draw calls, 10 materials, and zero
  downloaded model/texture dependencies;
- reads consistently in front, three-quarter, profile, top, and outsole named views.

Blocking failures are an oversized generic sneaker silhouette, flat slab construction, detached
parts, an invisible colorway change, unmirrored left/right bounds, missing outsole evidence, or a
camera view that clips the shoe.
