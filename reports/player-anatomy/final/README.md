# Player anatomy and customization QA

All captures were made in Chrome at a 1280×720 viewport against
`http://127.0.0.1:4193`. Scale/joint guides were disabled for detail captures.
The renderer reported no warnings or errors.

## Reproducible captures

| Evidence | Exact state | Renderer evidence |
| --- | --- | --- |
| `hand-defense-front.png` | `/player-lab.html?athlete=classic&pose=defense&view=hand-front&shoe=court-classic`, then disable Scale guides | 44 draws, 5,900 triangles, 2 textures, 60 FPS |
| `hand-defense-profile.png` | Same query with `view=hand-profile`, then disable Scale guides | 65 draws, 8,420 triangles, 2 textures, 45 FPS at capture |
| `leg-proportions-front.png` | `/player-lab.html?athlete=classic&pose=neutral&view=legs-front&shoe=court-classic`, then disable Scale guides | 87 draws, 13,184 triangles, 2 textures, 60 FPS |
| `leg-proportions-three-quarter.png` | Same query with `view=legs-three-quarter`, then disable Scale guides | 85 draws, 13,004 triangles, 2 textures, 60 FPS |
| `height-range-comparison.png` | `/player-lab.html?compare=heights&pose=neutral&view=front&shoe=court-classic` | 215 draws, 31,834 triangles, 3 textures, 50 FPS |
| `my-player-customization.png` | Create `Anatomy QA`, choose Short Locs, Deep Espresso, and 2.05 m; open My Player | Hair, skin-tone, and height controls all visible at 1280×720 |

## Measured changes

The lower-body radii are centralized in `js/player-anatomy.js`:

- thigh: 0.112 → 0.090 local units (-19.6%);
- visible knee base radius: 0.103 → 0.072 (-30.1%), with a flatter
  `[0.82, 0.55, 0.76]` knee scale;
- calf: 0.086 → 0.068 (-20.9%).

The resulting thigh-to-current-high-top ankle ratio is `0.090 / 0.082 = 1.098`;
the calf-to-ankle ratio is `0.068 / 0.082 = 0.829`. Shoe mounting, grounded
feet, shorts collision geometry, and defensive joint rotations were not moved.

Hand sizing uses the pooled measurements in the CDC-hosted DiDomenico and
Nussbaum paper: 18.0 cm hand length, 8.3 cm hand breadth, and 173.2 cm stature.
That produces:

`handLengthLocal = 2.722 × (0.18 / 1.732) = 0.28286`

`handBreadthLocal = 0.28286 × (0.083 / 0.18) = 0.13043`

NCSU's tables independently report mean hand length of 18.05 cm for women and
19.38 cm for men, and mean breadth of 7.94/9.04 cm. Those values are checks,
not separate gender-locked models. The NCSU source summarizes U.S. military
personnel, while the CDC-hosted paper studied 100 adults from a regional
university/community sample. Neither population represents every player, so
the implementation deliberately uses one neutral normalized ratio and lets
overall player height scale it.

Sources:

- https://multisite.eos.ncsu.edu/www-ergocenter-ncsu-edu/wp-content/uploads/sites/18/2016/06/Anthropometric-Detailed-Data-Tables.pdf
- https://stacks.cdc.gov/view/cdc/191543/cdc_191543_DS1.pdf

## Visual review

The front and profile captures pass the stylized real-time quality contract:
all five digits read separately, digit lengths taper, the thumb is opposed,
and the wrist overlaps its attachment without a gap. Left/right digit roots
and splay angles are exact sign mirrors. The leg views show a continuous,
narrower thigh-knee-calf silhouette without changing the high-top collar fit.

The My Player capture proves eight hair choices, eight skin tones, and the
height slider are available together. Height is stored in metres, displayed in
imperial and metric, clamped to 1.68–2.18 m, and applied only when the profile
configuration is merged into a controlled roster entry. CPU entries retain
their authored roster heights.

Honest limitations:

- Hands remain deliberately stylized: no nail plates, palm creases, or
  independently rigged third phalanx.
- Hair uses silhouette clumps rather than strand simulation.
- Height changes stature and modestly changes width, but does not provide
  separate wingspan or body-mass controls.
