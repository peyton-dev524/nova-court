# NOVA COURT performance and animation audit

Audit date: 2026-07-26  
Scope: `js/engine.js`, `js/app.js`, player rig, VFX pool, replay buffer, 1v1/3v3 crowd presentation, and current automated tests.

## Executive result

The project already has several sound foundations for a 60 FPS target: frame-rate-independent animation damping (`js/engine.js:33-34`), a fixed-step physics loop (`js/engine.js:1351-1365`), an instanced 164-person crowd (`js/engine.js:1034-1060`), and a preallocated 52-particle VFX pool (`js/engine.js:1182-1197`). The two most important remaining risks are a measurable neutral-pose foot penetration and uncapped high-cost work in 3v3 at high pixel ratios.

This audit adds `js/performance-profile.js`, a DOM/THREE-free set of helpers for adaptive quality, fixed-step bounding, pool pressure, and measured foot-sole correction. It is intentionally not wired into the engine in this workstream.

## Prioritized findings

### P0 — Neutral player feet penetrate the floor by about 0.346 world units

Evidence:

- The physics root is grounded at `root.position.y = 0` on landing (`js/engine.js:1495-1504`).
- Neutral hips are at `y = 0.9` (`js/engine.js:249-251`).
- The foot chain descends through hip `-0.05`, knee `-0.575`, outsole center `-0.603`, and outsole half-height `0.0175` (`js/engine.js:351-375`).
- Therefore the neutral outsole bottom is `0.9 - 0.05 - 0.575 - 0.603 - 0.0175 = -0.3455` before player height scaling. A 2.08 m player scales the error to approximately `-0.378`.
- The contact shadow and selection marker are correctly placed just above the floor (`js/engine.js:385-403`), making the shoe clipping more visually obvious.

Integration:

1. Keep the gameplay/physics root at `y = 0`; do not lift it.
2. Add a visual/model wrapper below the physics root, or maintain a `rigGroundOffset` added to the hips base in `updateAnimation`.
3. After the rig pose is updated, measure both outsole bottoms in world space. Pass those values to `calculateFootGroundCorrection`.
4. Smooth the returned offset with `dampFootGroundCorrection`; apply it only while grounded. Fast rise prevents clipping, while the slower release avoids landing pops.
5. For a minimal first correction, the current 1.9 m neutral rig needs roughly `+0.3515` visual units with the default 0.006 clearance, but runtime measurement is required for moving legs and taller players.

Acceptance evidence to collect after integration:

- At least 10 seconds of idle, run, defense slide, every dribble move, shot landing, rebound landing, and block landing with neither outsole below `floorY - 0.01`.
- Automated assertions for 1.9 m and 2.08 m players at neutral pose and maximum landing squash.

### P0 — Quality is manual and does not react to sustained missed frame budgets

Evidence:

- The renderer starts with device pixel ratio capped at 1.75 in normal quality and 1 in performance mode (`js/app.js:138-148`).
- The engine can independently cap as high as 2 (`js/engine.js:685-695`).
- A 2048×2048 soft shadow map is always configured when shadows are enabled (`js/engine.js:693-695`, `js/engine.js:744-749`).
- The settings handler only switches pixel ratio and all shadows on/off (`js/app.js:707-712`). There is no p95 frame-time governor, hysteresis, shadow-map downgrade, particle scaling, replay sampling downgrade, or crowd-density downgrade.

Risk:

At 1920×1080 with DPR 1.75, the color target is about 6.35 million pixels before overdraw and shadow work. This is 3.06× the pixel count of DPR 1. A six-player scene containing many separate shadow-casting body meshes amplifies both CPU draw-call and GPU shadow-map cost.

Integration:

1. Record 120-180 `requestAnimationFrame` deltas in a fixed-size numeric ring buffer.
2. Every 2-3 seconds, call `recommendQualityTier(samples, currentTier, { cooldownReady })`.
3. Apply `resolveQualitySettings` to renderer pixel ratio, shadow enablement/map size, particle admission, replay sample rate, and crowd density.
4. Change at most one tier per decision and enforce a 4-6 second cooldown to prevent visible oscillation.
5. Reset measurements after tab visibility changes; hidden-tab deltas are not GPU performance evidence.

### P1 — Physics catch-up can run six 120 Hz steps after every 50 ms frame

Evidence:

- `rawDt` is capped to 50 ms (`js/engine.js:1351-1354`).
- The entire accumulated delta is consumed by an unrestricted `while` loop at 120 Hz (`js/engine.js:1359-1364`), allowing six full fixed updates before visuals and rendering.
- Each fixed update performs player integration, O(n²) separation, ball physics, collision checks, pickup/rebound searches, and replay recording (`js/engine.js:1388-1411`).

Risk:

This is bounded by the 50 ms clamp at the current `timeScale = 1`, so it is not an infinite spiral. It can still create a feedback loop on slower hardware: a late frame performs six simulation updates, delaying the next frame and keeping the game late. Future replay slow/fast time scaling would widen the risk.

Integration:

- Replace the accumulator loop planning with `planFixedSteps`.
- Start with `fixedStep: 1/120`, `maxFrameDelta: 0.05`, and `maxSubSteps: 4`.
- Run exactly `plan.steps`; store `plan.nextAccumulator`.
- Track `saturated` and `droppedTime` as telemetry. If saturation persists, lower visual quality; do not allocate or run additional catch-up steps.
- Optionally interpolate visual transforms with `interpolationAlpha`.

### P1 — Per-frame allocation churn is concentrated in AI snapshots and camera/rebound helpers

Evidence:

- Every app frame builds a fresh AI snapshot with newly mapped player objects (`js/app.js:469-499`) and then performs `engine.players.find(...)` for each intent (`js/app.js:502-508`).
- Camera update allocates at least two vectors every presented frame and two additional vectors in some branches (`js/engine.js:2124-2150`).
- Fallback AI allocates a vector per external player per fixed update (`js/engine.js:1457-1467`).
- Pickup/rebound checks clone each player position every fixed update while the ball is loose (`js/engine.js:2042-2055`).
- Active blocks allocate hand, reflection, and normalized-facing vectors during checks (`js/engine.js:1851-1858`).
- Scoring and collision events clone vectors and score objects (`js/engine.js:1901-1903`, `1981-1983`, `2003-2006`, `2029-2033`). Event-time allocations are acceptable; frame-time allocations are the priority.

Integration:

1. Add engine-owned scratch vectors (`_scratchA` through `_scratchD`) for camera, fallback AI, rebound distance checks, and block math.
2. Build a `playersById` map when rosters change; replace per-intent `.find`.
3. Reuse AI snapshot player records keyed by id, mutating numeric fields in place. Preserve immutable snapshots only for debugging capture.
4. Make HUD and AI cadence explicit: AI decision snapshots can run at 20-30 Hz while movement intent remains active; HUD text can update at 10-20 Hz or only when values change.
5. Use the browser Performance panel or allocation sampling to confirm a flat live heap after 5 minutes of 3v3.

### P1 — Replay recording creates arrays and shifts the buffer during live play

Evidence:

- At 30 Hz, replay recording creates a frame object, ball array, one array per player, and a mapped players array (`js/engine.js:2173-2180`).
- Once the buffer reaches 150 frames, `shift()` moves the remaining array entries on every new recorded frame (`js/engine.js:2181`).
- Queuing a highlight shallow-copies the 150-frame array (`js/engine.js:2184-2192`).
- Playback performs a linear `.find` for every recorded player (`js/engine.js:2206-2220`).
- Replay currently restores only player position and root yaw; recorded state is not applied (`js/engine.js:2179`, `2215-2220`). This limits animation fidelity even though the state string is paid for in storage.

Integration:

1. Replace the shifting array with a preallocated circular buffer.
2. Store numeric data in typed arrays: time, ball xyz, and fixed roster transforms/state indices.
3. Resolve player indices once at replay start instead of calling `.find` per player per playback frame.
4. Use the active quality preset's `replaySampleHz` (20/24/30).
5. For smoother animated highlights, either apply recorded state plus normalized state time, or record compact rig pose parameters (gait phase, action progress, airborne blend, dribble move/progress). Interpolate between adjacent replay frames instead of selecting a single floor-index frame.

### P1 — Player rendering scales poorly from 1v1 to 3v3

Evidence:

- Every procedural player constructs separate geometries/materials for body parts, apparel, facial details, shoes, contact shadow, and marker (`js/engine.js:237-405`).
- `_mesh` sets almost every mesh to cast and receive shadows (`js/engine.js:208-212`).
- The detailed player is composed of dozens of individual meshes, so six players multiply both the main-pass and shadow-pass draw calls.
- Player disposal correctly traverses and releases geometries/materials (`js/engine.js:627-634`), so the issue is frame cost rather than a clear lifetime leak.

Integration:

1. Cache immutable geometries globally per engine and share them across all players.
2. Share materials by palette where possible; jersey number textures can remain per player.
3. Disable `castShadow` on tiny details: eyes, nose, wristbands, collar, headband, number planes, outsole, and side panels.
4. Consider merging static meshes by material within each limb or using a skinned low-poly character once animation requirements stabilize.
5. Gate contact shadows/markers by distance and mode.
6. Establish a draw-call acceptance target with `renderer.info.render.calls`: under 180 main-pass calls in 3v3 balanced mode is a reasonable first gate; measure rather than assuming.

### P2 — Crowd design is efficient, but should become quality-aware

Evidence:

- The arena crowd uses one `InstancedMesh` for 164 spectators (`js/engine.js:1034-1060`), which is substantially cheaper than individual meshes.
- Instance color creation occurs only during arena construction (`js/engine.js:1039-1057`), not during live frames.
- The crowd does not currently animate or cast shadows, which is favorable for 60 FPS.

Recommendation:

- Keep the crowd instanced.
- On balanced/performance tiers, draw only the first `floor(count * crowdDensity)` instances via `crowd.count`; no geometry rebuild is needed.
- If crowd animation is added, use a single shader/instance attribute phase or update a small front-row subset at 10-15 Hz. Do not animate 164 Object3D transforms in JavaScript every frame.
- Retain crowd presence in both 1v1 and 3v3; density scaling is preferable to removing it.

### P2 — VFX is pooled but each particle has a unique material and burst admission scans the full pool

Evidence:

- The 52 particle meshes are correctly preallocated (`js/engine.js:1182-1197`).
- Each particle owns a separate material so per-particle opacity/color can change (`js/engine.js:1186-1196`).
- Every burst scans from the start of the pool for dead entries (`js/engine.js:2071-2084`); each visual frame scans all particles to update live entries (`js/engine.js:2087-2101`).
- Dribble trails can request a burst every 55 ms (`js/engine.js:1956-1961`), while scoring can request 24 particles (`js/engine.js:2028-2029`).

Recommendation:

- At 52 entries this CPU scan is small; avoid premature complexity.
- Apply `calculatePoolReusePlan` before cosmetic bursts. When utilization is high, reduce trail emission and preserve capacity for scores/blocks.
- Use `recommendPoolCapacity` when VFX lifetimes or peak spawn rates change. Never expand the pool during gameplay.
- A future GPU-instanced particle system would reduce draw calls, but only after renderer statistics show VFX is a material bottleneck.

### P2 — HUD work is performed every app animation frame even when values are unchanged

Evidence:

- The app owns a second RAF loop (`js/app.js:623-638`) in addition to the engine RAF (`js/engine.js:1351-1374`).
- `updateHUD()` is called every live app frame (`js/app.js:635`), and writes multiple `textContent`, width styles, and player labels (`js/app.js:556-582`).
- The shot-meter event also writes DOM styles frequently while charging (`js/app.js:374-379`).

Recommendation:

- Keep a cached HUD view model and only write changed fields.
- Throttle clock-only updates to 10-20 Hz.
- Keep shot meter updates on RAF but avoid setting an identical rounded percentage.
- A single master RAF would make ordering and profiling easier, but merging loops is less important than eliminating repeated DOM writes and allocations.

## Animation smoothness assessment

Positive evidence:

- Animation easing is exponential and therefore frame-rate independent (`js/engine.js:33-34`).
- Gait phase advances continuously instead of resetting on state changes (`js/engine.js:423-445`).
- Locomotion, sprint, defense, and airborne weights are damped (`js/engine.js:434-443`).
- Player root turning also uses the same exponential factor (`js/engine.js:1511-1517`).
- Ball-to-hand tracking uses exponential damping (`js/engine.js:1925-1955`).

Remaining concerns:

- Feet have no IK or planted-foot constraint; rotation-only gait plus a moving hips height can slide or penetrate even after the neutral offset is fixed (`js/engine.js:489-547`).
- Replay chooses a discrete recorded frame without interpolation (`js/engine.js:2209-2220`), producing 30 Hz positional stepping during 0.62× playback.
- Camera projection is updated every frame even when FOV is already effectively unchanged (`js/engine.js:2161-2162`).

Recommended order:

1. Correct the rig baseline/foot penetration.
2. Add support-foot detection and visual-offset damping.
3. Interpolate replay frames and preserve action phase.
4. Only then consider two-bone foot IK; the procedural style may not need full IK if measured sole correction and gait tuning pass visual QA.

## Test gaps

Current package tests cover game rules, modes, mechanics, practice, and AI shooting, but `package.json` does not include any performance or render-budget suite. The new `tests/performance_profile.test.mjs` covers:

- Frame-time statistics and invalid sample filtering.
- Adaptive quality downgrade/upgrade/cooldown hysteresis.
- Pixel-ratio/feature preset resolution.
- Fixed-step cap, dropped catch-up time, and interpolation remainder.
- Pool capacity and saturated reuse behavior.
- Current neutral-rig penetration, airborne bypass, safety clamp, and frame-rate-independent correction damping.

Still required after engine integration:

- A browser smoke test collecting at least 30 seconds of frame times in 1v1 and 3v3 at 1920×1080, DPR 1 and DPR 1.75.
- `renderer.info.render.calls`, triangles, textures, and programs captured after warmup for each mode/tier.
- A five-minute 3v3 heap-stability test with replay and repeated restarts.
- Automated foot-sole world-height assertions across idle, sprint, defense, all dribble moves, shot, block, rebound, and replay.
- A replay interpolation test ensuring continuous position/yaw and restored animation phase.
- Long-frame simulation tests proving no more than four fixed updates per rendered frame.

## 60 FPS acceptance gate

Use a release build and a representative integrated-GPU desktop:

- 1v1 balanced: p95 frame time ≤ 16.67 ms over 60 seconds.
- 3v3 balanced: p95 ≤ 16.67 ms and frames over 25 ms < 2%.
- Performance tier: p95 ≤ 16.67 ms at 1920×1080 DPR 1 with shadows disabled.
- No frame exceeds six fixed simulation updates; after helper integration, no frame exceeds four.
- Live heap returns to a stable band after repeated highlights and ten rematches.
- No outsole penetrates below `floorY - 0.01` while grounded.

These are gates to measure after integration; the current source inspection alone does not prove 60 FPS on target hardware.
