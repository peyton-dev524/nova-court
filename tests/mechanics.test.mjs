import test from "node:test";
import assert from "node:assert/strict";
import {
  DRIBBLE_MOVE_CONFIG,
  DRIBBLE_MOVES,
  animationDampingFactor,
  apexReleaseQuality,
  getDribbleMovePath,
} from "../js/engine.js";

test("shot release quality peaks exactly at the jump apex", () => {
  assert.equal(apexReleaseQuality(0), 1);
  assert.ok(apexReleaseQuality(0.2) > apexReleaseQuality(2));
  assert.ok(apexReleaseQuality(-0.2) > apexReleaseQuality(-3));
});

test("all nine signature dribble moves are exposed", () => {
  assert.deepEqual([...DRIBBLE_MOVES].sort(), [
    "behindBack",
    "betweenLegs",
    "crossover",
    "doubleCross",
    "hesi",
    "inOut",
    "shamgod",
    "snatchBack",
    "spin",
  ]);
});

test("every handle has a smooth finite ball path and valid timing", () => {
  for (const move of DRIBBLE_MOVES) {
    const config = DRIBBLE_MOVE_CONFIG[move];
    assert.ok(config.duration >= 0.4 && config.duration <= 0.8, move + " duration");
    let previous = getDribbleMovePath(move, 0, 1);
    for (let step = 1; step <= 40; step++) {
      const sample = getDribbleMovePath(move, step / 40, 1);
      assert.ok(Number.isFinite(sample.side + sample.forward + sample.height), move + " finite path");
      assert.ok(Math.hypot(sample.side - previous.side, sample.forward - previous.forward, sample.height - previous.height) < 0.24, move + " continuity");
      assert.ok(sample.height > 0.1, move + " ball stays above floor");
      previous = sample;
    }
    assert.equal(previous.endHand, config.switchesHand ? -1 : 1, move + " hand result");
  }
});


test("animation damping is frame-rate independent", () => {
  const fullFrame = animationDampingFactor(10, 1 / 30);
  const halfFrame = animationDampingFactor(10, 1 / 60);
  const twoHalfFrames = halfFrame + (1 - halfFrame) * halfFrame;
  assert.ok(Math.abs(fullFrame - twoHalfFrames) < 1e-12);
  assert.ok(animationDampingFactor(10, 0) === 0);
});
