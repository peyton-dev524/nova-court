# NOVA Cut Academy footwear study

## Outcome

The fourth production shoe is a stylized original NOVA low-top informed by six official Nike
G.T. Cut Academy product views. It is procedural Three.js geometry, not a downloaded model or
photo projection. It contains no Nike logo, wordmark, reference pixels, or copied branded panel
mesh. Official images are retained for reference-only evaluation.

References captured before implementation:

- `official-view-01-admitted.png`: lateral
- `official-view-02-admitted.png`: outsole
- `official-view-03-admitted.png`: medial
- `official-view-04-admitted.png`: top
- `official-view-05-admitted.png`: three-quarter
- `official-view-06-admitted.png`: rear

All six are 1728 px, pass the img2threejs admission gate, and have distinct perceptual hashes.
Nike's official product page identifies FB2599-400 and Glacier Blue / White / Photon Dust /
Metallic Silver. The size chart gives a US men's 10 foot length of 10 11/16 in (27.1 cm);
Nike does not publish external last dimensions, so the 29.7 × 10.9 × 10.5 cm runtime envelope is
explicitly inferred.

## Mathematical build

- Elliptical cross-sections: `x = cos(theta) * halfWidth(z)` and
  `y = centerY(z) + sin(theta) * halfHeight(z)`.
- Width field: maximum of heel, waist and forefoot Gaussian radius functions, followed by a
  nonlinear toe taper.
- Rocker: cosine-eased toe and heel lifts with continuous endpoints.
- Collar: 30-sample ellipse with sine-weighted front dip and rear rise.
- Laces, original NOVA wing and support embroidery: deterministic Catmull-Rom tube sweeps.
- Traction: mirrored directional herringbone bars with a separate midfoot shank bridge.

Measured output is 29.700 × 11.136 × 10.410 cm, within declared tolerances. High detail uses 5,840
triangles, 19 factory draw calls (20 in the lab including the floor), nine materials, zero textures,
and held 60 FPS in the browser capture. Profile, three-quarter and top silhouettes passed the
multi-angle non-degeneracy test.

## Review history

| Pass | Evidence | Review |
|---|---|---|
| intake | six official angles | major silhouette, closure, medial/rear construction and outsole are visible |
| blockout/form | profile, top, front | continuous loft has a wide forefoot, pinched waist, rounded heel and low collar |
| structure | `structural-pass-wireframe.jpg` | named sole/upper/closure/support parts are independently pickable; laces and overlays overlap parents |
| material | `material-pass-ember-ice.jpg` | color changes are material-only; Ember Ice gives the clearest panel separation |
| optimization | five named final views | 5,840 triangles, 19 model draws, zero textures; no registry growth |

The strict sculpt-spec gate passes. The deterministic exact-reference silhouette gate does not:
IoU is 0.256 after camera/background matching. That is recorded rather than overclaimed. The
procedural upper has a flatter, more angular toe-to-quarter transition and a simpler heel/collar
than the Nike product. This is accepted for the requested simple, stylized original study and
avoids duplicating branded geometry. Multi-angle geometry still passes: three-quarter/profile
area ratio 0.644 and top/profile ratio 0.620, both far above the 0.15 collapse threshold.

## Production wiring

- `createBasketballShoe()` now supports `cut-academy`.
- NOVA Flight, Court Classic, Precision 7 Study, and NOVA Cut Academy all accept the same five
  selectable color studies.
- Color selection changes material colors only, with identical topology and bounds.
- `shoeColorwayId` persists in profile schema v6, reaches engine metadata, and is passed into both
  production player shoes.
- First-run and Style Locker controls expose shoe style and shoe color independently.
- The Shoe Lab exposes every style/color combination and named deterministic cameras.

Tests cover dimensions, `sin`/`cos` continuity, left/right bounds, color-only topology, persistence,
render budgets, stateless registry behavior, runtime factory selection, and UI/lab wiring.

