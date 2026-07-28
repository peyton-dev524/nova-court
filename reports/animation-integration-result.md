# Animation continuity integration result

Date: 2026-07-27

The issues measured in `animation-motion-audit.md` were subsequently addressed in the live engine. The earlier report remains the before-state audit and rationale.

Implemented:

- `getShotAnimationPose` now uses independent monotonic shot and release clocks through `sampleShotFormTiming`. Releasing no longer resets the gathered set point.
- Each character has a stable `shootingHand` independent of `dribbleHand`.
- The compact original jumper includes a controlled dip/load, stacked shooting elbow, guide-hand separation, wrist snap, held follow-through, and softer landing compression.
- Signature moves use simulation-time progress rather than render-frame countdown.
- A second handle input is queued until a transfer phase instead of replacing the active path immediately.
- Every incoming move starts from the ball's measured player-local position and crossfades with a quintic curve.
- Switching moves commit hand ownership around the body-crossing phase rather than at input time.
- Ball bounce events use periodic crossing detection, so long frames cannot skip the hand/sound transfer.
- Dribble arms receive a restrained ball-position reach correction, while the signature pose remains procedural and original.
- Gait phase advances from actual court displacement, reducing speed/cadence mismatch and visible foot skating.
- Losing possession cancels queued handle state, preventing a stale combo from overriding shot/pass animation.

Key locations:

- `js/animation-continuity.js`: pure timing, blending, crossing, gait, and shooting-form helpers.
- `js/engine.js`: `ProceduralPlayer.updateAnimation`, `_samplePlayerHandleTarget`, `_startDribbleMove`, `_syncPlayerActionTiming`, `performDribbleMove`, `beginShot`, `releaseShot`, `shoot`, and `_updatePossessedBall`.
- `tests/animation_continuity.test.mjs`: continuity and release-form regression coverage.

Validation:

- Focused animation/mechanics tests: 13/13 passed.
- Full discovered suite: 86/86 passed.
- Production build: succeeded.

Remaining visual gates require browser capture rather than source-level inference: palm-to-ball distance during all nine moves, planted-foot court drift, and side-by-side 30/60/144 Hz shot release footage.
