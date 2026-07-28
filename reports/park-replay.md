# NOVA Park + Replay Visual Module

`js/park-visuals.js` is a code-native visual subsystem. It uses no downloaded
textures, fonts, models, logos, or other external assets.

## Park integration

```js
import { createNightPark } from "./park-visuals.js";

const park = createNightPark(engine.T, {
  parent: engine.worldRoot,
  quality: settings.visualQuality, // "low", "balanced", or "high"
  courtWidth: COURT.width,
  courtLength: COURT.length,
  seed: 7319,
});

// Per render frame. `energy` can be crowd excitement from 0..1.
park.update(dt, energy);

// Before rebuilding the arena or destroying the engine.
park.dispose();
```

The park contains a paved apron, chain-link-style fencing, deterministic
instanced skyline, reusable lamp geometry, benches, compact bleachers, an
instanced two-mesh crowd, and an original NOVA PARK sign. The high tier caps
the crowd at 88 instances and shadow-casting lights at two. Balanced uses two
unshadowed lights; low relies on emissive lamp heads.

## Replay integration

Use `getReplayFrameWindow(frames.length, normalized)` instead of selecting the
nearest replay frame. Interpolate the ball and player transforms between its
`from` and `to` indexes using `alpha`.

```js
const cameraSample = sampleReplayCamera({
  progress: normalized,
  ball: interpolatedBall,
  scorer: scorerPosition,
  hoop: [0, COURT.rimY, COURT.basketZ],
  seed: replay.seed,
  courtWidth: COURT.width,
});

camera.position.fromArray(cameraSample.position);
cameraTarget.fromArray(cameraSample.target);
camera.fov = cameraSample.fov;
camera.lookAt(cameraTarget);
```

`sampleReplayCamera()` provides a four-beat sequence: establish, sideline
tracking, rim orbit, and a seed-selected hero shoulder. The returned
`slowMotion` is suitable as the replay timeline rate for the current segment.

`sampleReplayPoseEmphasis()` returns additive animation envelopes for jump
lift, torso lean, shooting-arm extension, wrist snap, landing compression,
celebration, impact pulse, and subtle camera shake. Apply these to the existing
procedural pose only during playback; do not feed them back into game physics.

All replay helpers consume and return plain numbers/arrays, are deterministic,
and can run independently of Three.js.
