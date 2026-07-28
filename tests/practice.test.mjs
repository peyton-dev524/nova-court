import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeMode } from "../js/practice.js";

test("practice starts live with an automatic ball return", () => {
  const mode = createPracticeMode();
  const response = mode.start();
  assert.equal(mode.phase, "live");
  assert.ok(response.commands.some((command) => command.type === "SET_BALL_LIVE"));
  assert.ok(response.commands.some((command) => command.type === "RETURN_BALL"));
});

test("practice tracks makes, attempts, and best streak", () => {
  const mode = createPracticeMode();
  mode.start();
  mode.handleEvent("SHOT_ATTEMPT", { shotId: "one" });
  mode.handleEvent("BASKET");
  mode.handleEvent("SHOT_ATTEMPT", { shotId: "two" });
  const response = mode.handleEvent("BASKET");
  assert.equal(response.state.makes, 2);
  assert.equal(response.state.attempts, 2);
  assert.equal(response.state.streak, 2);
  assert.equal(response.state.bestStreak, 2);
  assert.ok(response.commands.some((command) => command.type === "RETURN_BALL"));
});

test("practice miss resets the current streak but keeps the best", () => {
  const mode = createPracticeMode();
  mode.start();
  mode.handleEvent("SHOT_ATTEMPT");
  mode.handleEvent("BASKET");
  mode.handleEvent("SHOT_ATTEMPT");
  const response = mode.handleEvent("MISS");
  assert.equal(response.state.streak, 0);
  assert.equal(response.state.bestStreak, 1);
  assert.equal(response.state.attempts, 2);
});

test("practice resolves abandoned shots and returns the ball", () => {
  const mode = createPracticeMode({ shotTimeout: 1 });
  mode.start();
  mode.handleEvent("SHOT_ATTEMPT");
  const response = mode.update(1.1);
  assert.equal(response.state.streak, 0);
  assert.equal(response.state.pendingShot, false);
  assert.ok(response.commands.some((command) => command.type === "RETURN_BALL"));
});
