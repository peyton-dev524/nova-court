# Shot coverage and live-ball duel APIs

Both modules are renderer-independent and deterministic. They never read the
DOM, Three.js state, wall-clock time, or `Math.random`.

## `js/shot-coverage.js`

- `calculateDefenderCoverage(input)` evaluates one defender from planar
  distance, position angle, contest timing, height/reach/vertical, hand
  proximity, contest intent, and active block window.
- `calculateShotCoverage(input)` aggregates helpers with diminishing overlap and
  exposes a value, integer percentage, coverage category, and HUD strings.
- `scoreReleaseTiming(input)` accepts either normalized quality or temporal
  release error.
- `calculateShotMakePercentage(input)` combines coverage, release, range-band
  rating, stamina, and human/AI difficulty adjustment. A valid wide-open perfect
  release is exactly 100%; every non-guaranteed shot remains bounded.
- `selectRimResult(input)` independently selects `clean_swish`,
  `soft_rim_bounce_in`, `rim_out`, or `bank`; a guaranteed make therefore need
  not be a swish.
- `resolveShotAttempt(input)` combines the percentage and explicit seeded
  `outcomeValue`/`rimValue` into a replay-stable result event.

Recommended integration is to build defender snapshots at release, display the
returned `hud` fields, and use the engine's seeded gameplay RNG only to supply
the normalized values.

## `js/live-ball-duels.js`

- `calculatePokeProbability(input)` evaluates a clean poke without treating
  every failed reach as a foul.
- `calculateAnkleBreakRisk(input)` uses the active move, move progress, ratings,
  momentum, discipline, and reach aggression. Returned stun duration is capped
  at exactly 1.5 seconds.
- `resolveLiveBallSteal(input)` returns one of `loose_ball`, `ankle_break`,
  `foul`, `missed_reach`, or `no_target`. Separate explicit check values make
  each branch deterministic.
- `calculateLooseBallDeflection(input)` returns owner last-touch metadata,
  planar roll/bounce velocity, spin, and pickup delay.
- `predictLooseBallRoll`, `rankPickupRace`, and `resolvePickupOpportunity`
  provide stable loose-ball pursuit ordering without assigning possession.

The `RELEASE_BALL_LOOSE` command intentionally has
`automaticPossession:false`; runtime integration should release the current
owner, preserve the reported owner last touch, and allow the normal pickup loop
to decide who reaches the rolling ball.

Focused validation:

```powershell
node --test tests/shot_coverage.test.mjs tests/live_ball_duels.test.mjs
```
