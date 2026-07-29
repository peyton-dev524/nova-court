# Attribute Impact QA

Captured at 1280×720 from `http://127.0.0.1:4293/attribute-impact-lab.html`.
All three inspected routes rendered without browser console warnings or errors.

## Routes and evidence

- `?panel=shooting` → `attribute-shooting-zones.png`
  - Same 72% release, 28% coverage, 82% stamina, and Pro difficulty.
  - Each comparison changes only the selected rating from 40 to 92.
- `?panel=steals` → `attribute-steal-matchup.png`
  - Same reach geometry and timing for both deterministic matchup builds.
  - A clean result remains a live rolling loose ball, never automatic possession.
- `?panel=rebound` → `attribute-rebound-boxout.png`
  - Shows predicted landing, a real inside box-out pair, side-specific OREB/DREB,
    and the stable candidate ranking.

The lab exposes:

```js
window.__NOVA_ATTRIBUTE_LAB__.setPanel("shooting" | "steals" | "rebound")
window.__NOVA_ATTRIBUTE_LAB__.snapshot()
```

## Production formulas

Shot probability selects `closeShot`, `drivingLayup`, `drivingDunk`,
`midRange`, `threePoint`, or `freeThrow` from the live shot context. Profile
ratings on the 25–99 scale normalize to 0–1 before the existing range, timing,
stamina, distance, coverage, and difficulty terms are applied. User perfect
greens remain guaranteed unless an active jump/block window disrupts them;
CPU greens stay probabilistic, and shooting assist still changes only the
controlled user's meter width.

Steal matchup:

```text
DEF = .52 steal + .28 perimeterDefense + .20 reaction
SEC = .42 ballHandle + .40 ballSecurity + .18 strength
EDGE = DEF - SEC
```

Geometry adds distance, angle, reach timing, exposure, contact, and ball-first
effects. Clean is capped to 3.5–78%, foul to 2.5–58%, and whiff receives the
remaining band.

Rebound score:

```text
34 arrival + 24 OREB/DREB + 8 vertical + 8 reach
+ 6 strength + 6 momentum + 8 inside position
+ 16 box-out leverage - 24 boxed-out penalty + role/defense bonuses
```

Arrival combines predicted landing distance and travel-time error. Box-outs
are computed bidirectionally from inside position, facing, proximity, and
strength. Equal scores use player id as a deterministic tie-break.

## Limitations

- The lab is a deterministic explanation view, not a rendered gameplay camera.
- A layup above 0.8 m/s uses `drivingLayup`; a slower paint attempt uses
  `closeShot`.
- Rebound ranking predicts the landing but production possession remains
  physically catch-proximity gated, so a distant high-rated player cannot
  teleport to the ball.
- `reaction` is supported explicitly when present; current My Player profiles
  derive the live fallback from acceleration, while CPU templates use their
  difficulty reaction fallback.
