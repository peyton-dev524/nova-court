# NOVA Flight Basketball Shoe

## Reference direction

The procedural shoe is an original NOVA design informed by the official Nike G.T. Future
product imagery. The reconstruction uses the visible low-top
silhouette, wide forefoot/heel, angled rocker sole, padded bootie, and molded shell as shape
evidence. It does not copy the Nike mark or project the source photograph onto the mesh.

Official reference:

- https://about.nike.com/en/newsroom/releases/nike-gt-future-official-images

Additional official comparison research:

- https://about.nike.com/en/newsroom/releases/nike-gt-cut-3-official-images
- https://news.adidas.com/basketball/adidas-basketball-launches-the-harden-vol-8/s/48f1c5a8-78b4-46af-a589-9135de95b6ed
- https://www.newbalance.com/pd/two-wxy-v4/BB2WYV4-US-CA-NR4.html

## Implementation

- `js/basketball-shoes.js` builds a reusable lofted Three.js shoe with no runtime textures.
- The player rig retains the existing foot pivot and named outsole contact used by ground
  correction.
- High detail includes crossed laces, vents, tread pods, and the original cyan NOVA slash.
- Crowded modes and the performance tier automatically hide micro shoe geometry.
- The Player Model Lab supports `?subject=shoe` with profile, top, and outsole review views.

## Known approximation

Only a lateral product view was available. The medial shell and outsole pod layout are
original inferred geometry. No source photograph or extracted texture is loaded or
projected in the game.

## QA evidence

- `screenshots/nova-flight-profile.png`
- `screenshots/nova-flight-top.png`
- `screenshots/nova-flight-outsole.png`
- `screenshots/nova-flight-player-integration.png`
- `screenshots/reference-profile-comparison.png`
