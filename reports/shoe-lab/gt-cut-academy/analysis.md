# G.T. Cut Academy-inspired procedural study — intake

## Scope and rights

This is a stylized, code-authored NOVA Court shoe study informed by Nike's official product
photographs. The six downloaded images remain reference-only evidence. No reference pixels,
logos, wordmarks, or branded geometry are shipped in the model or runtime. The procedural mark is
an original angular NOVA wing. Nike retains all rights in the product photography and product
design.

- Official product page: https://www.nike.com/t/gt-cut-academy-basketball-shoes-HWCFvAob
- Official size chart: https://www.nike.com/size-fit/unisex-footwear-mens-based
- Product/color reference: FB2599-400, Glacier Blue / White / Photon Dust / Metallic Silver
- Captured before implementation: lateral, outsole, medial, top, three-quarter, and rear.
- All six 1728 px evidence views passed the img2threejs reference-admission gate after conversion
  to 24-bit non-interlaced PNG; the original CDN downloads are retained alongside admitted copies.

## Layered observation

1. **Identification:** low-top adult basketball shoe; layered textile/rubber/foam object;
   `primaryDomain=object`; high confidence.
2. **Overall form:** bilateral foot-shaped volume with a long rounded-rectangle footprint, wide
   forefoot, pinched waist, rounded heel, low collar and toe rocker. The lateral/medial asymmetry
   is limited to overlays and marks, while the sole is approximately symmetric.
3. **Macro / meso / micro:** macro assemblies are outsole, dual-density midsole, upper and closure.
   Meso systems are padded heel quarter, collar, tongue, eyestays, lateral/medial overlays,
   forefoot wrap, heel counter, and shank bridge. Micro systems are six crossed lace stations,
   heel perforations, forefoot ventilation marks, upper support stitches and repeated herringbone
   traction bars.
4. **Relationships:** outsole supports and slightly wraps the midsole; midsole overlaps the lower
   upper edge; collar/tongue overlap inside the upper; eyestays overlap the tongue; lace tubes
   bridge paired eyestays; heel counter and forefoot guard overlap both upper and sole.
5. **Materials:** satin/matte engineered mesh upper (dielectric, roughness ~0.76), smoother
   synthetic overlays (~0.48), matte dual foam (~0.68), high-roughness rubber (~0.9), soft textile
   collar/laces (~0.92), and a small low-roughness metallic-silver accent (~0.28).
6. **Color/finish:** reference is pale cyan upper, white sole/closure, light gray outsole, and
   metallic gray/black accents. Runtime adds original color studies without copying the reference
   surface.
7. **Identity-defining visible systems:** broad low-top mesh quarter, wide toe bumper, sculpted
   sidewall with lateral forefoot fin, long angular lateral mark, paired material zones at the
   toe, six-station closure, pinched midfoot bridge, and dense herringbone traction.
8. **Uncertainty:** Nike publishes foot-length sizing but not external shoe width/height. For a US
   men's 10, the size chart lists a 10 11/16 in (27.1 cm) foot. Runtime outer bounds are an explicit
   inference: 29.7 cm long, 10.9 cm wide, 10.5 cm high. Internal Zoom Air geometry, exact foam
   stack thickness, hidden seam depth, and production last are not reconstructed.

## Suitability and quality contract

Suitability is **pass for a stylized real-time procedural study**: six non-degenerate official
angles expose all major silhouettes, materials, closure, rear and outsole. It is not suitable for
manufacturing accuracy or brand-exact duplication.

Definition of done:

- bounds stay within ±3 mm length, ±2.5 mm width, ±3 mm height of the documented inferred target;
- sole width uses continuous Gaussian zones and the vertical loft uses ellipse `sin/cos` rings;
- toe/heel rocker is a continuous cosine-eased function;
- blockout reads correctly in profile, top and outsole views;
- model remains truly volumetric in front, three-quarter, profile, top and outsole cameras;
- all macro/meso parts are named/pickable and surface details explode with their parent;
- at least three selectable color studies alter material colors only, never topology;
- high detail remains below 18,000 triangles, 26 draw calls, 10 materials and zero textures;
- left/right builds have matching bounds and mirrored lateral systems;
- repeated create/dispose/color-switch loops do not grow a shared registry.

Blocking defects: wrong heel/toe orientation, a slab-like upper, missing collar opening, disconnected
overlays/laces, money-shot-only lateral silhouette, outsole without directional traction, colorway
changing geometry, or any budget/dimension/mirroring failure.

Review cameras: front, three-quarter, lateral profile, top, outsole, plus a reference comparison.

