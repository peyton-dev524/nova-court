import test from "node:test";
import assert from "node:assert/strict";
import {
  PARK_QUALITY,
  REPLAY_SHOTS,
  getReplayFrameWindow,
  replayEase,
  sampleReplayCamera,
  sampleReplayPoseEmphasis,
  selectReplayShot,
} from "../js/park-visuals.js";

test("park quality tiers scale expensive scene features monotonically", () => {
  assert.ok(PARK_QUALITY.low.crowd < PARK_QUALITY.balanced.crowd);
  assert.ok(PARK_QUALITY.balanced.crowd < PARK_QUALITY.high.crowd);
  assert.ok(PARK_QUALITY.low.skyline < PARK_QUALITY.high.skyline);
  assert.equal(PARK_QUALITY.low.activeLights, 0);
  assert.equal(PARK_QUALITY.high.castShadows, true);
  for (const config of Object.values(PARK_QUALITY)) {
    assert.ok(config.crowd <= 100, "crowd stays within the mobile-safe instance budget");
    assert.ok(config.activeLights <= 4, "dynamic lamp budget is bounded");
  }
});

test("replay easing is clamped, continuous, and monotonic", () => {
  assert.equal(replayEase(-1), 0);
  assert.equal(replayEase(0), 0);
  assert.equal(replayEase(1), 1);
  assert.equal(replayEase(2), 1);
  let previous = 0;
  for (let step = 1; step <= 100; step++) {
    const value = replayEase(step / 100);
    assert.ok(value >= previous);
    assert.ok(value - previous < 0.04);
    previous = value;
  }
});

test("frame windows interpolate across the entire source buffer", () => {
  assert.deepEqual(getReplayFrameWindow(0, 0.5), { from: -1, to: -1, alpha: 0 });
  assert.deepEqual(getReplayFrameWindow(1, 0.5), { from: 0, to: 0, alpha: 0 });
  assert.deepEqual(getReplayFrameWindow(10, 0), { from: 0, to: 1, alpha: 0 });
  assert.deepEqual(getReplayFrameWindow(10, 1), { from: 9, to: 9, alpha: 0 });
  const middle = getReplayFrameWindow(10, 0.5);
  assert.deepEqual({ from: middle.from, to: middle.to }, { from: 4, to: 5 });
  assert.ok(Math.abs(middle.alpha - 0.5) < 1e-12);
});

test("replay shot selection creates a readable four-beat highlight", () => {
  assert.equal(selectReplayShot(0), REPLAY_SHOTS.ESTABLISH);
  assert.equal(selectReplayShot(0.3), REPLAY_SHOTS.SIDELINE_TRACK);
  assert.equal(selectReplayShot(0.65), REPLAY_SHOTS.RIM_ORBIT);
  assert.equal(selectReplayShot(0.9, 0), `${REPLAY_SHOTS.HERO_FOLLOW}-right`);
  assert.equal(selectReplayShot(0.9, 1), `${REPLAY_SHOTS.HERO_FOLLOW}-left`);
});

test("cinematic camera samples are finite and never collide with their target", () => {
  const expectedShots = [
    REPLAY_SHOTS.ESTABLISH,
    REPLAY_SHOTS.SIDELINE_TRACK,
    REPLAY_SHOTS.RIM_ORBIT,
    `${REPLAY_SHOTS.HERO_FOLLOW}-left`,
  ];
  const samples = [0.05, 0.32, 0.66, 0.91].map((progress) => sampleReplayCamera({
    progress,
    ball: [0.4, 3.1, -5.5],
    scorer: [-1.2, 0.6, -3.4],
    seed: 3,
  }));
  assert.deepEqual(samples.map((sample) => sample.shot), expectedShots);
  for (const sample of samples) {
    assert.ok(sample.position.every(Number.isFinite));
    assert.ok(sample.target.every(Number.isFinite));
    assert.ok(Number.isFinite(sample.fov) && sample.fov >= 28 && sample.fov <= 44);
    assert.ok(sample.slowMotion >= 0.4 && sample.slowMotion <= 0.9);
    assert.ok(Math.hypot(
      sample.position[0] - sample.target[0],
      sample.position[1] - sample.target[1],
      sample.position[2] - sample.target[2],
    ) > 0.04);
  }
});

test("replay pose emphasis peaks around the make and resolves into celebration", () => {
  const gather = sampleReplayPoseEmphasis(0.2);
  const impact = sampleReplayPoseEmphasis(0.67);
  const finish = sampleReplayPoseEmphasis(1);
  assert.ok(gather.jumpLift > 0);
  assert.ok(impact.impactPulse > 0.99);
  assert.ok(impact.cameraShake > finish.cameraShake);
  assert.ok(impact.shootingArmExtension > gather.shootingArmExtension);
  assert.equal(finish.celebration, 1);
  for (const progress of [0, 0.2, 0.5, 0.67, 0.8, 1]) {
    const pose = sampleReplayPoseEmphasis(progress);
    assert.ok(Object.values(pose).every(Number.isFinite));
  }
});
