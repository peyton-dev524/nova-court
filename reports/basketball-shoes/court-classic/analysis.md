# NOVA Court Classic — intake, dimensions, and quality contract

## Suitability

Verdict: **conditional pass for a stylized real-time reconstruction**. The official outer-side
product view has a strong, unobstructed silhouette and clear canvas/rubber material separation.
The official page also exposes top/side, angled, outsole, and heel views. Exact branding is outside
scope and intentionally omitted. Medial construction, internal padding, and construction thickness
remain inferred; this is not manufacturing geometry.

## Bottom-up image analysis

1. **Identity / class** — a high-top canvas court shoe, `object` domain, with a rubber cup/foxing
   system and lace closure. It is a compound, bilateral wearable object.
2. **Overall silhouette** — a low rocker sole with a rounded toe; the forefoot is long and tapered,
   while the rear quarter rises into a near-vertical ankle collar. The last is bilaterally
   symmetric in width but the visible quarter-panel detailing is lateral.
3. **Macro components** — outsole/foxing platform, canvas upper/last, high ankle quarter and tongue.
4. **Meso components** — curved rubber toe cap, vamp and quarter panels, collar binding, heel
   reinforcement, seven eyelet pairs, crossed lace system, sole sidewall band, tread field.
5. **Micro features** — double-row seam lines, narrow sidewall stripe, eyelet rims, canvas-grain
   roughness cue, toe-cap edge seam, tread chevrons. No logo or circular ankle patch is carried
   into the NOVA design.
6. **Spatial relationships** — the canvas upper overlaps the midsole socket; the toe cap wraps and
   embeds into the forefoot; the tongue is socketed behind the vamp; eyelets sit on paired facing
   panels; laces bridge paired eyelets; the collar binding follows the ankle opening; the outsole
   remains the named ground-contact part.
7. **PBR observations** — the canvas is a dielectric, high-roughness woven surface; the rubber toe
   and foxing are dielectric with lower roughness and broad highlights; the eyelets are small
   metallic rims; laces are matte fiber. The code-only target uses no projected or downloaded
   texture.
8. **Uncertainty** — the lateral screenshot does not reveal internal construction, exact medial
   panel topology, outsole thickness, or factory dimensions. The outsole/heel references reduce
   but do not eliminate those unknowns. Hidden surfaces are explicitly authored inference.

## Dimension evidence and scale

- **Sourced:** Converse's official size guide gives men's US 10 / EU 44 heel-to-toe foot length as
  **28.5 cm**.
- **Inferred target outer envelope:** **29.5 cm long × 10.8 cm maximum width × 14.0 cm total
  high-top height**. Tolerances for the procedural model are ±0.3 cm length, ±0.25 cm width, and
  ±0.35 cm height.
- **Game mapping:** 1 model unit = 1 meter. The expected model envelope is therefore
  0.295 × 0.108 × 0.140 units before the existing foot mount transform.

The reference-backed number is foot length only. Outer length, width, and ankle height are
proportion inferences chosen for a readable game asset, not claims about the physical product.

## Procedural geometry contract

- The sole and upper use lofted elliptical rings. Ring coordinates use `cos(theta)` for lateral
  width and `sin(theta)` for crown/underside height.
- The toe-cap rise uses a quarter-sine profile so the rubber wrap meets the upper without a
  faceted corner.
- The outsole rocker uses a cosine easing profile with a flat midfoot/contact interval and raised
  toe/heel samples.
- The collar uses an ellipse sampled with sine/cosine and an open rear notch.
- The seven eyelet pairs and crossed laces are a deterministic repetition system.
- Each visible assembly is a named mesh or named group for picking/explode coverage.

## Predictive real-time budget

At high detail, one shoe must remain below **13,500 triangles, 22 draw calls, 9 materials, and
zero textures**. The lower-detail mode may omit stitching/tread micro-geometry. A pair must remain
well below the existing athlete/court budget. The new style targets fewer triangles than the
existing NOVA Flight where practical.

## Review contract

Required review views: neutral lateral profile, neutral three-quarter/top, grazing-light
three-quarter, outsole, and mounted-on-player. Block acceptance on a wrong high-top silhouette,
floating tongue/laces, toe-cap gaps, incorrect ground contact, fewer than seven eyelet pairs,
collapsed width from another camera, or clipping through the player foot.

Official references:

- Product and multi-angle imagery:
  https://www.converse.com/shop/p/chuck-70-canvas-unisex-high-top-shoe/164944C_070.html
- Size guide:
  https://www.converse.com/fr/en/size-chart-guide?id=men
