import test from "node:test";
import assert from "node:assert/strict";

import {
  basketCollisionCandidates,
  basketForPossession,
  clampPlayerToRuntime,
  createCourtRuntime,
  shotValueForRuntime,
} from "../js/court-runtime.js";

test("full-court runtime has two attack baskets and enlarged 32m bounds", () => {
  const court = createCourtRuntime("fives");
  assert.equal(court.kind, "full");
  assert.equal(court.length, 32);
  assert.ok(basketForPossession(court, "home").z < 0);
  assert.ok(basketForPossession(court, "away").z > 0);
});

test("shot value is measured against the possession team's hoop", () => {
  const court = createCourtRuntime("fives");
  assert.equal(shotValueForRuntime(court, { x: 0, z: -10 }, "home"), 2);
  assert.equal(shotValueForRuntime(court, { x: 0, z: 0 }, "home"), 3);
  assert.equal(shotValueForRuntime(court, { x: 0, z: 10 }, "away"), 2);
});

test("collision selection follows the nearest full-court hoop", () => {
  const court = createCourtRuntime("fives");
  assert.equal(basketCollisionCandidates(court, { z: -12 })[0][0], "home");
  assert.equal(basketCollisionCandidates(court, { z: 12 })[0][0], "away");
});

test("player clamping uses full court baselines", () => {
  const court = createCourtRuntime("fives");
  assert.deepEqual(clampPlayerToRuntime(court, { x: 20, z: -20 }), { x: 8.58, z: -15.58 });
});

