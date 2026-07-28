import test from "node:test";
import assert from "node:assert/strict";

import {
  isShotMeterPerfect,
  SHOT_METER_PERFECT_HALF_WIDTH,
} from "../js/shot-coverage.js";
import {
  shootingAssistDisplay,
  shotPerfectHalfWidthForPlayer,
  userShotPerfectHalfWidth,
} from "../js/shooting-assist.js";

test("shooting assist creates deterministic expert, standard, and relaxed green windows", () => {
  assert.equal(userShotPerfectHalfWidth(0), 0.024);
  assert.equal(userShotPerfectHalfWidth(0.5), SHOT_METER_PERFECT_HALF_WIDTH);
  assert.equal(userShotPerfectHalfWidth(1), 0.064);

  assert.deepEqual(
    [0, 0.5, 1].map((value) =>
      Number(shootingAssistDisplay(value).windowPercent.toFixed(1)),
    ),
    [4.8, 7.2, 12.8],
  );

  assert.equal(isShotMeterPerfect(0.78, 0.72, userShotPerfectHalfWidth(0)), false);
  assert.equal(isShotMeterPerfect(0.78, 0.72, userShotPerfectHalfWidth(0.5)), false);
  assert.equal(isShotMeterPerfect(0.78, 0.72, userShotPerfectHalfWidth(1)), true);
});

test("shooting assist changes only the controlled player's green window", () => {
  const cpu = { controlled: false };
  const user = { controlled: true };

  assert.equal(shotPerfectHalfWidthForPlayer(cpu, 0), SHOT_METER_PERFECT_HALF_WIDTH);
  assert.equal(shotPerfectHalfWidthForPlayer(cpu, 1), SHOT_METER_PERFECT_HALF_WIDTH);
  assert.ok(shotPerfectHalfWidthForPlayer(user, 1) > shotPerfectHalfWidthForPlayer(user, 0.5));
  assert.ok(shotPerfectHalfWidthForPlayer(user, 0) < shotPerfectHalfWidthForPlayer(user, 0.5));
});

test("shooting assist labels communicate the slider progression", () => {
  assert.equal(shootingAssistDisplay(0).label, "EXPERT");
  assert.equal(shootingAssistDisplay(0.5).label, "STANDARD");
  assert.equal(shootingAssistDisplay(0.75).label, "FORGIVING");
  assert.equal(shootingAssistDisplay(1).label, "RELAXED");
});
