# NOVA COURT dribble and shot motion audit

Audit date: 2026-07-27  
Scope: procedural rig and ball animation in `js/engine.js`, input selection in `js/controls.js`, and AI handle/shot decisions in `js/ai.js`. Desired direction: polished, readable modern basketball using wholly original procedural motion.

## Result

The current animation foundation is substantially better than a placeholder: exponential damping is frame-rate independent (`engine.js:51-52`), gait phase persists across state changes (`engine.js:476-497`), airborne/locomotion weights are blended (`engine.js:487-496`), the ball follow factor is exponential (`engine.js:2223-2253`), and replay now interpolates recorded poses (`engine.js:2533-2664`).

Two high-impact discontinuities remain:

1. Releasing a jumper resets the shooting pose clock, collapsing the elbow stack at the exact moment it should extend.
2. Chaining handles replaces the active ball target without an outgoing/incoming crossfade; measured legal target gaps reach 1.73 world units.

## Prioritized findings

### P0 — Jump-shot release resets gathered form

Evidence:

- `getShotAnimationPose` drives gather, torso lift, and elbow stack from `stateTime` (`engine.js:54-69`).
- At a representative apex pose (`stateTime=0.45`, `jumpVelocity=0.2`), the current helper returns gather `1`, set point `1`, torso lift `0.1`, and elbow stack `1`.
- `releaseShot` sets `shotReleased = true` and then resets `stateTime = 0` (`engine.js:1941-1943`).
- At the same jump velocity with reset time, gather becomes `0`, torso lift `0`, and elbow stack `0`; set point also falls to about `0.898`.
- Arm targets directly consume those values (`engine.js:613-628`). Exponential joint damping softens the collapse but does not prevent the release hitch.

Fix:

1. Keep a monotonic `shotElapsed` from gather through landing.
2. Add a separate `releaseElapsed`, initialized to zero when the ball leaves the hand.
3. Drive gather, set point, torso lift, and elbow stack from `shotElapsed`; drive follow-through, guide-hand release, and wrist snap from `releaseElapsed`.
4. Do not reset the action clock in `releaseShot`.
5. `sampleShotFormTiming` in `js/animation-continuity.js` provides this split without external animation data.

Acceptance:

- Shoulder, elbow, and wrist angular deltas remain continuous across the release frame at 30, 60, and 144 Hz.
- The elbow stays stacked and the shooting wrist completes its snap over roughly 0.18-0.22 seconds after release.
- The guide hand separates laterally without crossing the ball path.

### P0 — Handle chains can jump the ball target by more than a body width

Evidence:

- A chain is accepted once the outgoing move has passed 36% progress, even while its action lock remains active (`engine.js:1779-1784`).
- Starting the next move immediately overwrites type, duration, remaining time, and starting hand (`engine.js:1785-1792`).
- The ball samples only the new path on the next possessed-ball update (`engine.js:2242-2253`); no outgoing target is retained.
- Exhaustive sampling at 42% outgoing progress finds the largest legal transition, shamgod → behind-the-back, is `1.7276` world units between targets. At the earliest 36% gate it is still `1.6685`.
- With follow lambda 38, the first 60 Hz rendered response covers about 47% of that gap. Damping is time-correct, but this remains a visible teleport rather than a handoff.

Fix:

1. On a chain request, retain outgoing move type, start hand, and progress.
2. Start a 0.10-0.14 second transition clock.
3. Re-sample the outgoing continuation and incoming path every update, then combine them with `blendHandleTargets`.
4. Use quintic easing so transition velocity and acceleration approach zero at both boundaries.
5. Delay gameplay momentum for the incoming move until its plant/push phase instead of applying every impulse on the input frame.
6. Cap or reject pairs whose measured gap remains excessive after crossfade; route them through a neutral pocket target if necessary.

### P1 — Dribble ownership changes before the ball crosses the body

Evidence:

- Switching moves invert `dribbleHand` immediately when the move starts (`engine.js:1792`).
- The path itself travels from `startHand` to `endHand` over the full move (`engine.js:95-141`).
- Arm selection sees both the already-switched active hand and original start hand (`engine.js:652-665`), so crossover-type moves often make both arms chase the ball simultaneously.
- Normal dribble resumes using the new hand at move end (`engine.js:671-680`).

Fix:

- Track `ballHandBlend` separately from `dribbleHand`.
- Preserve start-hand ownership until the ball crosses center or reaches a move-specific transfer phase.
- Blend ownership across 60-100 ms; only commit `dribbleHand` after the transfer.
- Drive each wrist toward the actual ball target with weighted ownership rather than using the same generic wave on both arms.

### P1 — Ball targets and hand targets are authored independently

Evidence:

- Signature ball positions come from `getDribbleMovePath` (`engine.js:95-141`, `2242-2251`).
- Arm targets come from separate `moveWave`, `doubleWave`, and move-name branches (`engine.js:501-533`, `652-670`).
- The ball path is rotated by root yaw only (`engine.js:2249-2251`), while several moves also rotate the hips locally (`engine.js:509-526`). Behind-the-back and spin targets therefore do not stay consistently behind the animated torso.
- Shot gather moves the ball to a synthetic centerline pocket (`engine.js:2236-2241`), but release starts at the selected hand socket (`engine.js:1902-1903`), permitting a last-frame ball/socket offset.

Fix:

1. Make the ball target authoritative.
2. Convert it into shoulder-local space and solve an approximate two-segment reach for shoulder pitch/out and elbow bend.
3. Apply a small palm offset along the ball surface; never place the wrist at the ball center.
4. For behind-the-back/spin, transform the target by the animated hips orientation or move the visual turn to a shared torso/root pivot.
5. During shot gather, blend from dribble target to a fixed shooting-hand pocket, then to the release socket. Assert the final held target and release start differ by less than 0.03 world units.

### P1 — Shooting hand changes with the last dribble hand

Evidence:

- `worldHandPosition` selects the arm from `dribbleHand` (`engine.js:466-468`).
- The shooting-form branch uses the same `dribbleHand` to choose the shooting arm (`engine.js:613-615`).
- AI and user shots therefore alternate left/right release form based on the previous handle instead of a stable player attribute.

Fix:

- Add an original roster attribute such as `shootingHand: 1 | -1`, defaulting consistently per character.
- Use `dribbleHand` only for live handles.
- During gather, transfer the ball to `shootingHand`; use the opposite arm as guide hand.
- Optionally support a deliberate off-hand layup selection near the rim, separate from jump-shot handedness.

### P1 — Move timers are advanced on the visual clock but sampled by fixed gameplay

Evidence:

- The frame loop runs up to three fixed 60 Hz updates before one visual update (`engine.js:1521-1539`).
- `dribbleMoveTime`, `stateTime`, and action locks decrement in `updateAnimation` (`engine.js:476-484`).
- Possessed-ball path sampling occurs in fixed ball updates (`engine.js:2223-2253`).
- On a long frame, all fixed steps see the same old move progress; only afterward does the visual clock advance. Shot release can likewise use a hand transform from the previous rendered pose.

Fix:

- Store `moveStartedAt`, `shotStartedAt`, and `releasedAt` in simulation time.
- Derive progress with `sampleActionProgress` wherever physics, ball, or visuals need it.
- Alternatively advance gameplay action clocks in `_fixedUpdate` and make visuals read-only consumers.
- At apex release, evaluate the shot socket at the exact simulation phase and update its matrix before reading the release position.

### P1 — Root velocity impulses occur before matching foot plants

Evidence:

- Every handle applies an immediate velocity add/multiply on its input frame (`engine.js:1793-1813`).
- Snatch-back can reduce current velocity to 22% and add `-3.0` forward instantly (`engine.js:1807-1809`).
- The leg pose starts at a zero `moveWave` and eases later (`engine.js:501-504`, `582-598`).
- Gait cadence is mostly clock-based rather than distance-based (`engine.js:495-497`), so sudden root acceleration/reversal is not matched by planted-foot travel.

Fix:

1. Define original move phases: gather, plant, transfer, burst, recover.
2. Apply momentum during plant/transfer, not at progress zero.
3. Use actual post-collision root displacement with `advanceDistanceDrivenGait`.
4. Add a short support-foot lock for crossovers/snatch-backs. Clamp visual pelvis offset rather than moving the physics root.
5. Preserve the current measured sole correction (`engine.js:688-706`) as the vertical safety layer; it prevents penetration but cannot solve horizontal skating.

### P2 — Narrow bounce/event windows should use cycle crossings

Evidence:

- Normal dribble hand switching requires `phase < 0.04` and prior phase above `0.9`; sound requires `phase < 0.06` (`engine.js:2227-2232`, `2263-2266`).
- Live fixed 60 Hz updates usually hit these windows, but deterministic `step(0.05)`, future lower simulation rates, or hitches can skip them.
- Trail emission resets to one 55 ms interval and does not emit missed intervals (`engine.js:2254-2259`), so VFX density varies with update rate.

Fix:

- Use `advancePeriodicPhase` and react to `crossings > 0`.
- Emit at most one sound per presented frame even if multiple crossings are reported.
- For trails, carry timer remainder and admit a capped number through the existing particle-pool pressure logic.

### P2 — Several named moves lack matching full-body mechanics

Evidence:

- Spin applies a sinusoidal hips yaw peaking around 1.24 radians and returning to zero (`engine.js:518-520`); it never performs a complete visual turn.
- Behind-the-back primarily changes ball depth and hips yaw, while foot phases remain generic (`engine.js:106-108`, `510`, `658-665`).
- Move-specific legs exist for between-legs, spin, snatch-back, double-cross, and in-out, but crossover/behind-back/hesi use mostly generic gait (`engine.js:582-598`).

Fix:

- Author original phase curves for pelvis yaw, shoulder counter-rotation, support foot, free foot, ball target, and momentum.
- A spin should use unwrapped visual yaw with a clear plant and recovery, while gameplay facing can remain independently controlled.
- Give crossover a lateral plant, behind-back a shielding shoulder turn, and hesi a genuine rise/freeze/re-acceleration.
- Keep silhouettes readable and avoid reproducing any identifiable real-player signature or proprietary captured sequence.

## Controls and AI notes

- Keyboard/gamepad input is edge-triggered and fast taps are preserved (`controls.js:142-199`), which is a good responsiveness foundation.
- Handle selection combines one modifier edge with movement direction (`engine.js:1649-1661`). This is readable but cannot express queued combo intent. Add a one-entry 120-180 ms input buffer so a requested follow-up begins at a legal transfer phase instead of interrupting immediately.
- AI already requests named moves based on lane/defender context (`ai.js:528`, `554`, `568`). Route AI and user commands through the same transition planner; do not let AI bypass plant/transfer rules.
- AI jumpers use the same queued apex release path (`engine.js:1968-1989`), so fixing the shot clocks improves both human and CPU form.

## New verification helpers

`js/animation-continuity.js` adds pure, integration-ready functions:

- `sampleActionProgress` — one simulation-time action clock.
- `blendHandleTargets` and `handleTargetDistance` — C2-continuous handle crossfades and gap telemetry.
- `advancePeriodicPhase` — robust bounce crossings.
- `advanceDistanceDrivenGait` — stride phase tied to court displacement.
- `sampleShotFormTiming` — monotonic gather plus independent release/follow-through timing.

`tests/animation_continuity.test.mjs` covers update partition independence, the measured 1.7-unit chain gap, eased target blending, unskippable cycle crossings, distance-driven gait, and no shot-form regression on release.

## Visual acceptance checklist

- Record 240 fps slow-motion captures of all nine handles from both starting hands at 30, 60, and 144 Hz render caps.
- No chained ball target moves more than 0.12 world units in one 60 Hz frame.
- Palm-to-ball-surface error stays under 0.06 during ordinary dribbles and under 0.09 during transfer phases.
- No planted foot travels more than 0.05 world units relative to the court during its contact window.
- Jumper elbow stack never regresses after the set point; release socket and ball start differ by less than 0.03.
- Left/right form is determined by player shooting-hand metadata, not the prior dribble hand.
- CPU and user use identical move timing, chain gates, hand transfer, and release-form paths.
