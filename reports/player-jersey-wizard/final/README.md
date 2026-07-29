# Player jersey and creation wizard visual QA

## Capture contract

- Desktop viewport: 1440 × 1000.
- Mobile viewport: 390 × 844.
- Player Model Lab subject: Classic Guard, default 1.04 performance fit, 29.75-inch
  body length, 8.2 cm side panel, 58% fabric response.
- Named jersey cameras: `jersey-front`, `jersey-side`, `jersey-back`, and
  `jersey-action`.
- Wizard QA route: `?onboarding=1&step=<identity|appearance|attributes|review>`.
- Asset state: all player, jersey, and shoe geometry is procedural and ready; no external
  garment texture is required at runtime.

## Visual inspection

- `jersey-front-desktop.png`: the V-neck, shoulder anchors, 4-inch-minimum front-number
  scale, loose straight hem, and waistband separation are readable. No torso or upper-arm
  clipping is visible.
- `jersey-side-desktop.png`: the deep armhole, side drape, and shorts separation remain
  readable from the profile camera. The armhole binding is intentionally stylized and does not
  reproduce an exact commercial seam.
- `jersey-back-desktop.png`: the back panel, 6-inch-minimum number scale, shoulder bridge,
  and straight hem remain symmetrical.
- `jersey-action-cloth.png`: the lower shell responds during a low-handle pose while the
  upper 38% remains attachment-locked at the chest and shoulders.
- `wizard-01` through `wizard-04`: identity, live appearance, read-only starting attributes,
  and review/save are distinct screens with visible progress state.
- Mobile captures show the same four steps with a single-column appearance layout and an
  internal vertical scroll area. No horizontal overflow remains.

## Measured contract

- Jersey-only cost: 5 draws, 880 triangles, 240 dynamic vertices/collision samples,
  zero textures.
- Maximum authored cloth offset: 4.2 cm.
- Minimum sampled torso clearance: at least 0.8 cm across the permitted fit range.
- Source measurements: 19-inch laid-flat width and 29.75-inch length target; +2/+4-inch
  length options; 4-inch front number, 6-inch back number, 1-inch armhole trim, and 4-inch
  side-panel maximums.

## Verification

- Full repository suite: 183/183 passing.
- Source check, production build, and `git diff --check`: passing.
- Screenshot manifest: 12 required final captures present.

## Known approximation

This is an original, stylized low-poly NOVA COURT garment. Catalog views do not reveal exact
interior seams, cloth thickness, or hidden back-neck construction, so those surfaces use
symmetrical inferred topology. The procedural jersey targets readable game motion and browser
performance, not a branded product replica.
