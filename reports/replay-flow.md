# Replay Flow Integration Contract

`js/replay-flow.js` is a deterministic, renderer-independent replay lifecycle.
It exists to prevent gameplay, input, AI, and clocks from resuming before a
scored highlight and its restoration animation are genuinely complete.

## Required engine wiring

```js
import { createReplayFlow, REPLAY_FLOW_PHASES } from "./replay-flow.js";

const replayFlow = createReplayFlow({
  queueDelay: 0.36,
  restoreDuration: 0.2,
});
```

On a scored highlight, call `requestHighlight()` immediately, before the next
simulation step. Store the returned token on the engine replay record.

```js
const token = replayFlow.requestHighlight({ id: possessionId });
```

Treat `replayFlow.frozen` as a replay-owned lock:

```js
const simulationLocked = userPaused || replayFlow.frozen;
if (!simulationLocked) {
  updateClock(dt);
  updateInput(dt);
  updateAI(dt);
  updatePhysics(dt);
}
```

Do not call the public user-pause toggle to implement this lock. Releasing a
replay must not accidentally clear a pause menu opened by the user.

Advance replay-flow time from the visual/render loop, since the simulation loop
is deliberately frozen. When `playbackready` is emitted, start only the replay
whose token matches the event:

```js
replayFlow.advance(renderDt);
for (const event of replayFlow.drainEvents()) {
  if (event.type === "playbackready" && replayFlow.startPlayback(event.token)) {
    engine.playHighlight(event.token);
  }
}
```

When the final replay animation frame has rendered, call
`completePlayback(token)`. This transitions to `restoring`, not `idle`.
During `restoring`, interpolate saved authoritative transforms, camera state,
pose state, and visual effects using `snapshot.restorationMix`.

At 100%, acknowledge the applied target:

```js
const flow = replayFlow.getSnapshot();
if (flow.phase === REPLAY_FLOW_PHASES.RESTORING) {
  applySavedState(flow.restorationMix);
  replayFlow.advance(renderDt, {
    restorationApplied: flow.restorationProgress >= 1 && savedStateWasApplied,
  });
}
```

Only the final `resume` event releases the replay-owned lock. Back-to-back
highlights transition from `restoring` directly to the next `queued` state and
never emit an intermediate `resume`.

## Exceptional paths

- Reduced motion or user skip: `skip(reason, token)` still enters restoration.
- Lost renderer/context or overlay interruption: `interrupt(reason)` drops
  pending highlights and restores the current one.
- Mode/world reset: `reset(reason)` invalidates all tokens immediately because
  the caller replaces the authoritative world state.
- Scheduled callbacks should always pass their captured token to
  `startPlayback(token)`; stale callbacks are rejected.
- The pending queue is bounded. When full, its last entry is replaced with the
  newest score so memory cannot grow without limit.

No assets, branding, browser globals, timers, or external dependencies are used.
