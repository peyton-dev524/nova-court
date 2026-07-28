import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTEXTUAL_I_ACTIONS,
  FreeThrowFlow,
  planLayupBank,
  resolveContextualIAction,
  resolveFreeThrowRelease,
  shouldEnforceOutOfBounds,
  shouldQueueMadeShotReplay,
} from "../js/finishing-mechanics.js";
import { resolvePickupOpportunity } from "../js/live-ball-duels.js";
import { createPracticeMode } from "../js/practice.js";

test("I is a contextual dunk near the offensive rim and remains steal on defense", () => {
  const dunk = resolveContextualIAction({
    hasBall: true,
    isOffense: true,
    distanceToRim: 1.7,
    stamina: 0.8,
  });
  const steal = resolveContextualIAction({
    hasBall: false,
    isOffense: false,
    distanceToRim: 1.2,
  });
  const tooFar = resolveContextualIAction({
    hasBall: true,
    isOffense: true,
    distanceToRim: 3.4,
  });
  assert.equal(dunk.action, CONTEXTUAL_I_ACTIONS.DUNK);
  assert.match(dunk.prompt, /HOLD I/);
  assert.equal(steal.action, CONTEXTUAL_I_ACTIONS.STEAL);
  assert.equal(tooFar.action, CONTEXTUAL_I_ACTIONS.NONE);
});

test("close layups author one decisive, guaranteed backboard contact", () => {
  const plan = planLayupBank({
    shooterPosition: { x: 1.1, z: -4.1 },
    rimPosition: { x: 0, y: 3.05, z: -5.7 },
    backboardZ: -6.16,
    attackSign: -1,
    contested: true,
  });
  assert.equal(plan.guaranteedMake, true);
  assert.equal(plan.requiresBackboard, true);
  assert.equal(plan.maxBackboardContacts, 1);
  assert.ok(plan.target.y > 3.35);
  assert.ok(plan.target.x > 0);
});

test("green free throws are perfect and guaranteed while non-green releases stay probabilistic", () => {
  const green = resolveFreeThrowRelease({
    charge: 0.72,
    rating: 0.4,
    outcomeValue: 0.999,
  });
  const early = resolveFreeThrowRelease({
    charge: 0.3,
    rating: 0.7,
    outcomeValue: 0.999,
  });
  assert.equal(green.perfectRelease, true);
  assert.equal(green.guaranteed, true);
  assert.equal(green.made, true);
  assert.equal(early.perfectRelease, false);
  assert.equal(early.guaranteed, false);
  assert.equal(early.made, false);
});

test("one-shot free throw flow exposes position, meter, release, and completion commands", () => {
  const flow = new FreeThrowFlow();
  const started = flow.start({ shooterId: "ace", teamId: "home", attempts: 1 });
  assert.deepEqual(
    started.commands.map((command) => command.type),
    ["POSITION_FREE_THROW", "SHOW_FREE_THROW_METER"],
  );
  assert.equal(flow.beginCharge(), true);
  assert.equal(flow.release({ charge: 0.72, outcomeValue: 1 }).made, true);
  const resolved = flow.resolve();
  assert.equal(resolved.complete, true);
  assert.equal(resolved.attemptsRemaining, 0);
  assert.equal(resolved.commands[0].type, "END_FREE_THROWS");
});

test("loose-ball recovery remains a live race available to offense or defense", () => {
  const ball = {
    position: { x: 0, y: 0.12, z: 0 },
    velocity: { x: 0.4, y: 0, z: 0 },
  };
  const defenseWins = resolvePickupOpportunity([
    { id: "dropper", teamId: "home", position: { x: -0.7, z: 0 }, speed: 4 },
    { id: "defense", teamId: "away", position: { x: 0.35, z: 0 }, speed: 4 },
  ], { ball, predictionSeconds: 0, pickupRadius: 0.8 });
  const offenseWins = resolvePickupOpportunity([
    { id: "dropper", teamId: "home", position: { x: 0.2, z: 0 }, speed: 4 },
    { id: "defense", teamId: "away", position: { x: 0.75, z: 0 }, speed: 4 },
  ], { ball, predictionSeconds: 0, pickupRadius: 0.8 });
  assert.equal(defenseWins.candidateTeamId, "away");
  assert.equal(offenseWins.candidateTeamId, "home");
  assert.equal(defenseWins.automaticPossession, false);
});

test("Open Gym explicitly suppresses boundary stoppages and made-shot replays", () => {
  const rules = createPracticeMode().getRules();
  assert.equal(rules.outOfBounds, false);
  assert.equal(rules.madeShotReplays, false);
  assert.equal(shouldEnforceOutOfBounds("open_gym"), false);
  assert.equal(shouldQueueMadeShotReplay("open_gym"), false);
  assert.equal(shouldEnforceOutOfBounds("half_court_3v3"), true);
  assert.equal(shouldQueueMadeShotReplay("half_court_3v3"), true);
});

