# Original dunk choreography integration

`js/dunk-choreography.js` defines four original procedural finishes:
`power_one_hand`, `power_two_hand`, `reverse`, and `tomahawk`. It does not
contain captured animation, player likeness data, trademarks, or copied motion.

Suggested integration:

1. At the current dunk context gate, call `evaluateDunkOpportunity` with player
   and rim positions, planar velocity, stamina, finishing/vertical/strength
   ratings, defender contest, traffic, and ball security.
2. When `shouldAttempt` is true, retain its `selection`. Drive the action with
   `progress = stateTime / selection.duration`.
3. Call `sampleDunkChoreography(selection, progress)` each frame. Its root,
   torso, arms, legs, ball, and rim channels are continuous normalized values.
   Blend them into the existing rig rather than replacing locomotion in one
   frame.
4. At the rim window, call `resolveDunkOutcome(selection, collisionFacts)`.
   Its event and hooks distinguish made, blocked, and missed finishes. A made
   finish requests a forced downward rim crossing; a block provides a
   deterministic loose-ball deflection and cancels hanging.
5. While gripping, call `getDunkHangState`. It permits only a short safety hang,
   extends that window when the landing zone is obstructed, and forces immediate
   release after a block or lost grip.

The selector is deterministic and explainable. Baseline angles favor a reverse,
traffic/strength favor a secure two-hand finish, clear high-speed runways can
unlock the tomahawk, and the one-hand power finish is the balanced default.

Focused validation:

```powershell
node --test tests/dunk_choreography.test.mjs
```
