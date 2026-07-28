# NOVA COURT gameplay expansion workstreams

Organized from the combined player-feedback prompt on 2026-07-28.

## Workstream A — Core basketball mechanics

Owner: `agent/core-mechanics`

Goal: make shooting, finishing, ball physics, and live-ball interactions readable and deliberate.

- Replace the white perfect-release window with green and make contact with that window the authoritative perfect result.
- Present a curved shot meter on the right only while shooting.
- Add a pooled green/cyan trail for perfect releases.
- Improve procedural dribbling, gather, set-point, release, and follow-through motion.
- Fix repeated backboard contacts on layups; make close contested layups use one decisive bank and resolve reliably.
- Add contextual hold/release dunk timing on `I` near the offensive basket while preserving defensive steal behavior.
- Add one timed free throw after a close-range shooting foul.
- Ensure successful steals create a recoverable rolling loose ball.
- Preserve clean swishes and believable rim-outs without stuck/glitch states.
- Disable replays and out-of-bounds stoppages in Open Gym.

Acceptance: targeted deterministic tests plus the complete test, syntax-check, and production-build suites.

## Workstream B — Team modes, AI, rules, and cameras

Owner: `agent/team-ai-modes`

Goal: make every team format run credible possessions with stable framing and smarter decisions.

- Add a complete 4v4 format beside 2v2, 3v3, and 5v5.
- Use a 21-second competitive shot clock with correct possession resets.
- After a foul or out-of-bounds event, require a direction-aware out-of-bounds inbound pass before live play.
- Improve default and transition cameras for 2v2, 3v3, 4v4, and 5v5.
- Enlarge the full-court 5v5 runtime bounds and keep both baskets/restart spots coherent.
- Prevent corner traps and repeated dribble spam with intent memory, cooldowns, spacing corrections, and escape decisions.
- Make AI take reasonable open shots, attack the rim, and dunk contextually.
- Expand difficulty from three to five meaningful presets.
- Show restart/rematch only for 1v1.

Acceptance: dedicated tests for 4v4, the 21-second clock, inbound gating, AI anti-spam/urgency, camera contracts, full-court scale, difficulty tuning, and restart visibility.

## Workstream C — Presentation, onboarding, models, and progression

Owner: `agent/presentation-progression`

Goal: make the game feel alive at first launch and give the player a persistent, rewarded identity.

- Add a first-join create-player flow with a saved/editable display name.
- Save and apply jersey number, jersey color/colorway, and avatar appearance.
- Add selectable titles every five overall points, `LEGEND` at 99, and entitlement-gated `DEV`, `TESTER`, and `OWNER` definitions.
- Make the win component of each match reward exactly 10 credits while preserving XP, mode pay, and idempotence.
- Run a lightweight bot-vs-bot attract game behind the main menu without rewards or progression writes.
- Add a replayable/skippable tutorial bot demonstration for movement, dribbling, shooting, passing, stealing, and finishing.
- Improve crowds, lighting, court readability, player silhouettes, joints, faces/hair, team distinction, and jersey readability.
- Reuse geometry/materials and instancing; do not add external models, likenesses, or uncontrolled asset payload.

Acceptance: profile migration/name/customization/title/reward tests, no-reward demo/tutorial contracts, renderer-budget coverage, and the complete test/check/build suites.

## Integration order

1. Merge core mechanics.
2. Merge team modes and AI, resolving shared `app.js`, `engine.js`, mode UI, and control-map changes against the mechanics contracts.
3. Merge presentation/progression, preserving the integrated mode catalog, controls, audio, and shot-meter behavior.
4. Rebuild `dist/`, run the full test suite, perform visible browser smoke tests across representative solo/team modes, and document any intentionally deferred items.
