import test from "node:test";
import assert from "node:assert/strict";

import {
  DRIBBLE_MOVE_CONFIG,
  getDribbleMovePath,
} from "../js/engine.js";
import {
  advanceDistanceDrivenGait,
  advancePeriodicPhase,
  blendHandleTargets,
  handleTargetDistance,
  sampleActionProgress,
  sampleShotFormTiming,
  smootherstep01,
} from "../js/animation-continuity.js";

test("absolute action progress is independent of update partitioning", () => {
  assert.ok(Math.abs(sampleActionProgress(10, 0.5, 10.2) - 0.4) < 1e-12);
  assert.ok(Math.abs(sampleActionProgress(10, 0.5, 10.1 + 0.1) - 0.4) < 1e-12);
  assert.equal(sampleActionProgress(10, 0.5, 20), 1);
});

test("quintic handle blend preserves endpoints and eases into large gaps", () => {
  const outgoing = getDribbleMovePath("shamgod", 0.42, 1);
  const nextHand = DRIBBLE_MOVE_CONFIG.shamgod.switchesHand ? -1 : 1;
  const incoming = getDribbleMovePath("behindBack", 0, nextHand);
  const rawGap = handleTargetDistance(outgoing, incoming);
  assert.ok(rawGap > 1.7, "characterizes the current legal chain discontinuity");

  assert.equal(smootherstep01(0), 0);
  assert.equal(smootherstep01(1), 1);
  assert.deepEqual(
    blendHandleTargets(outgoing, incoming, 0),
    { ...outgoing, blendWeight: 0 },
  );
  const completed = blendHandleTargets(outgoing, incoming, 1);
  assert.ok(Math.abs(completed.side - incoming.side) < 1e-12);
  assert.ok(Math.abs(completed.height - incoming.height) < 1e-12);
  assert.ok(Math.abs(completed.forward - incoming.forward) < 1e-12);
  assert.equal(completed.blendWeight, 1);

  const early = blendHandleTargets(outgoing, incoming, 0.1);
  assert.ok(handleTargetDistance(outgoing, early) < rawGap * 0.01);
});

test("periodic phase crossing cannot be skipped by a long update", () => {
  const single = advancePeriodicPhase(0.91, 0.24);
  assert.equal(single.crossings, 1);
  assert.ok(Math.abs(single.phase - 0.15) < 1e-12);

  const first = advancePeriodicPhase(0.91, 0.12);
  const second = advancePeriodicPhase(first.phase, 0.12);
  assert.equal(first.crossings + second.crossings, single.crossings);
  assert.ok(Math.abs(second.phase - single.phase) < 1e-12);
});

test("distance-driven gait is invariant to frame subdivision", () => {
  const once = advanceDistanceDrivenGait(0.4, 0.18, 1.5);
  const twice = advanceDistanceDrivenGait(
    advanceDistanceDrivenGait(0.4, 0.09, 1.5),
    0.09,
    1.5,
  );
  assert.ok(Math.abs(once - twice) < 1e-12);
});

test("separate release clock preserves the gathered shooting form", () => {
  const beforeRelease = sampleShotFormTiming({
    shotElapsed: 0.45,
    releaseElapsed: 0,
    jumpVelocity: 0.2,
    released: false,
  });
  const atRelease = sampleShotFormTiming({
    shotElapsed: 0.45,
    releaseElapsed: 0,
    jumpVelocity: 0.2,
    released: true,
  });
  assert.equal(beforeRelease.gather, 1);
  assert.equal(atRelease.gather, beforeRelease.gather);
  assert.equal(atRelease.setPoint, beforeRelease.setPoint);
  assert.equal(atRelease.elbowStack, beforeRelease.elbowStack);
  assert.equal(atRelease.torsoLift, beforeRelease.torsoLift);
  assert.equal(atRelease.followThrough, 0);
  assert.equal(atRelease.wristSnap, 0);

  const followThrough = sampleShotFormTiming({
    shotElapsed: 0.57,
    releaseElapsed: 0.12,
    jumpVelocity: -0.8,
    released: true,
  });
  assert.ok(followThrough.followThrough > 0.7);
  assert.ok(followThrough.wristSnap > 0.4);
  assert.equal(followThrough.elbowStack, 1);
});


test("engine shot pose keeps the compact set point while release clock begins", async () => {
  const { getShotAnimationPose } = await import("../js/engine.js");
  const held = getShotAnimationPose(0.45, 0.2, false, 0);
  const released = getShotAnimationPose(0.45, 0.2, true, 0);
  assert.equal(held.setPoint, released.setPoint);
  assert.equal(held.elbowStack, released.elbowStack);
  assert.equal(held.torsoLift, released.torsoLift);
  assert.equal(released.followThrough, 0);
  assert.equal(released.wristSnap, 0);
  assert.ok(released.kneeBend >= held.kneeBend);
});
