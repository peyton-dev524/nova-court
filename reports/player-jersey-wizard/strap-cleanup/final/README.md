# Player jersey strap and neck-cord cleanup

## Result

The production jersey rig now contains one named rendered part:

- `dimensioned-loose-jersey-shell`

The four separate `TubeGeometry` overlays that read as shoulder straps and a
neck/chest cord were removed:

- `front-v-neck-binding`
- `back-neck-binding`
- `left-armhole-binding`
- `right-armhole-binding`

This is a geometry removal, not a color or material mask. Production gameplay,
the My Player live preview, and Player Model Lab all instantiate
`ProceduralPlayer`, which creates this shared `createBasketballJerseyRig`.

## Reproducible visual proof

All captures are real Player Model Lab named views at 1280x720.

| Screenshot | Named route | Visual check |
| --- | --- | --- |
| [jersey-front-clean.png](./jersey-front-clean.png) | `?athlete=classic&pose=neutral&view=jersey-front` | Bare shoulders remain visible; no V-shaped tube crosses the chest or neckline. |
| [jersey-side-clean.png](./jersey-side-clean.png) | `?athlete=classic&pose=neutral&view=jersey-side` | The arm opening is the cloth-shell silhouette, without a tube wrapping over the shoulder. |
| [jersey-back-clean.png](./jersey-back-clean.png) | `?athlete=classic&pose=neutral&view=jersey-back` | No separate back-neck cord or shoulder binding is visible. |
| [jersey-defense-action-clean.png](./jersey-defense-action-clean.png) | `?athlete=classic&pose=defense&view=jersey-action&jerseyMotion=1` | Dynamic defensive pose keeps the neckline and both arm openings free of overlay geometry. |

Each route rendered one WebGL canvas and reported zero console warnings and
zero console errors during capture.

## Deterministic proof and budget

`tests/basketball_jersey_wizard.test.mjs` asserts:

- the named production part manifest contains only the cloth shell;
- the removed artifact names cannot overlap the rendered part manifest;
- jersey construction contains no `TubeGeometry`;
- the compatibility `bindings` collection is frozen and empty;
- production, My Player, and Player Model Lab all consume the same player rig;
- the corrected jersey costs 1 draw call and 432 triangles, down from 5 draw
  calls and 880 triangles.

The existing clearance sampling still proves at least 8 mm of torso clearance,
and the cloth motion remains bounded to 42 mm.

## Limitation

The neckline and arm openings are defined by the existing 24-segment procedural
shell, so their intentionally low-poly contour remains visible at this close
debug-camera distance. This change does not redesign the jersey cut or alter
player anatomy; it only removes the requested strap/cord artifacts.
