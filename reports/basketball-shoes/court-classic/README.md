# NOVA Court Classic Basketball Shoe

## Reference and dimensional basis

The Court Classic is an original NOVA high-top informed by the construction of a plain
canvas basketball shoe. The implementation uses no brand marks, source textures, or
projected reference pixels.

Official references:

- Converse Chuck 70 product construction (heavyweight canvas, rubber toe cap and
  foxing): https://www.converse.com/shop/p/chuck-70-canvas-unisex-high-top-shoe/164944C_070.html
- Converse size guide: https://www.converse.com/fr/en/size-chart-guide?id=men

The official size guide lists a 28.5 cm foot length for men's US 10 / EU 44. Product
outer dimensions are not published, so the runtime target is explicitly inferred:
29.5 cm long, 10.8 cm wide, and 14.0 cm high. The reproducible bounds test allows
0.3 cm length, 0.25 cm width, and 0.35 cm height tolerances.

Measured high-detail runtime bounds:

- length: 29.70 cm
- width: 10.96 cm
- height: 14.20 cm

## Procedural construction

`js/basketball-shoes.js` builds the model entirely from Three.js geometry:

- cosine/sine elliptical loft rings shape the sole, canvas upper, and rounded ankle
  quarter;
- a sine-profiled half-shell creates a rubber toe cap that embeds into the foxing,
  curves across the vamp, and converges at the front instead of floating as a pill;
- a trigonometric collar loop plus a curved inset creates the high-top opening;
- seven independently visible eyelet pairs drive crossed lace segments;
- raised, contrasting tread bars make the outsole readable in its named review view.

The style is selectable during player creation and from the saved profile. The same
canonical `shoeStyleId` is passed to the production player rig and Player Model Lab.

## Visual correction history

1. The first profile capture was cropped. The standalone review scale changed from
   2.35 to 1.85 and the camera target was centered on the full model.
2. The first full capture showed a slab heel, flat collar, floating toe pill, and a
   weak outsole. The heel and quarter profiles were tapered, the collar received a
   curved dark inset, the toe became a custom half-shell, and tread relief/contrast
   increased.
3. The first half-shell still exposed a forefoot lip and blue upper through the cap.
   The upper, quarter, tongue, eyelets, and stitching now terminate behind the seam.
   The cap gained continuous sidewalls from foxing to crown, a bowed cosine/sine vamp
   junction, and width/height that converge at a rounded point 2 mm beyond the midsole.
4. A continuous but wedge-shaped correction was rejected. The final 8.15 cm cap uses
   11 longitudinal stations, sine crown easing, and cosine width taper. It rises from
   a zero-height seam at `z=+0.068m`, domes smoothly, and falls to the rounded nose.

The final player integration capture confirms both shoes remain grounded and do not
clip through the feet. Remaining approximation: canvas is a deliberately low-cost
rough material rather than simulated woven cloth, and unseen medial padding is
inferred.

## Runtime budget

High-detail shoe:

- 3,030 triangles
- 16 model draw calls
- 8 materials
- 0 model textures

That is 22 triangles lighter than the existing high-detail NOVA Flight shoe. The lab
HUD includes its own floor/shadow texture, so a screenshot can report one scene
texture even though the shoe contract test proves the model itself uses zero.

## Reproducible QA

Run from the repository root:

```powershell
node --test tests/basketball_shoe_styles.test.mjs
node --test tests/player_progression.test.mjs tests/player_model_harness.test.mjs
python C:\Users\joshs\.codex\skills\img2threejs\forge\stage2_spec\validate_sculpt_spec.py reports\basketball-shoes\court-classic-sculpt-spec.json --strict-quality
npm run check
npm run build
```

The geometry test constructs the actual model with the vendored Three.js runtime and
checks bounds, cost limits, named parts, left/right mounting parity, style fallback,
and texture count. Progression and harness tests cover save migration plus gameplay,
profile, and lab wiring.

## Final captures

- `screenshots/court-classic-profile.jpg`
- `screenshots/court-classic-three-quarter.jpg`
- `screenshots/court-classic-outsole.jpg`
- `screenshots/court-classic-player-integration.jpg`
