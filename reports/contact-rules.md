# Contact rules integration

`js/contact-rules.js` is a renderer-independent rules layer. It never reads the
DOM, Three.js state, wall-clock time, or `Math.random`, so the same simulation
snapshot always produces the same result.

Recommended engine integration points:

1. Before the current boundary bounce/clamp in `_updateBall`, call
   `detectOutOfBounds` with `ball.previousPosition`, `ball.position`,
   `COURT`, and `COURT.ballRadius`. If it reports an exit, call
   `resolveOutOfBounds`, emit its `event`, and apply/forward its commands.
2. On a steal attempt, feed authored collision facts to
   `estimateStealFoulRisk`. Keep steal success and foul risk as separate rolls:
   a failed steal is not automatically a foul.
3. On block/drive/rebound contact, call `resolveContactFoul`. Forward its `FOUL`
   event to the active mode. `START_FREE_THROWS` needs a small free-throw
   sequence in the app; `BEGIN_CHECK` already matches the current mode command.
4. During a missed-shot rebound window, use `evaluateBoxOut` for nearby
   opponents and pass those leverage values into `rankReboundCandidates`.
   The first ranked entry is the deterministic favorite; `share` can be used
   with the engine's seeded gameplay RNG when ratings-based variation is wanted.

Mode behavior is explicit:

- `street_1v1` and `half_court_3v3`: opponent check after out of bounds;
  shooting fouls award the original 1/2-point shot value in free throws.
- `three_point_contest`: interference/out-of-bounds replays an uncounted ball.
- `open_gym`: automatic ball return; fouls are classified but ignored.

Run the focused suite with:

```powershell
node --test tests/contact_rules.test.mjs
```
