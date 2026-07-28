import test from "node:test";
import assert from "node:assert/strict";
import { createAIDirector } from "../js/ai.js";
import { getShotAnimationPose } from "../js/engine.js";

function shootingSnapshot({ shotClock = 14, defenderX = 5.8 } = {}) {
  return {
    players: [
      {
        id: "cpu-handler",
        teamId: "away",
        position: { x: 0, z: 0.2 },
        velocity: { x: 0, z: 0 },
        hasBall: true,
        aiEnabled: true,
        shooting: 0.92,
        stamina: 0.94,
        role: "handler",
      },
      {
        id: "human-defender",
        teamId: "home",
        position: { x: defenderX, z: 3.5 },
        isHuman: true,
        aiEnabled: false,
      },
    ],
    ball: {
      position: { x: 0, z: 0.2 },
      holderId: "cpu-handler",
      isLoose: false,
      airborne: false,
      isShotResolved: true,
    },
    offenseTeamId: "away",
    phase: "live",
    possessionId: 4,
    shotClock,
    attackBaskets: {
      home: { x: 0, z: -5.7 },
      away: { x: 0, z: -5.7 },
    },
    court: { halfWidth: 7.5, halfLength: 7, threePointRadius: 6.15 },
  };
}

test("CPU handler recognizes and takes an open jumper", () => {
  const director = createAIDirector({ difficulty: "pro", seed: 21 });
  const snapshot = shootingSnapshot();
  const intents = director.update(0.1, snapshot);
  const handler = intents.find((intent) => intent.playerId === "cpu-handler");
  assert.equal(handler?.action?.type, "shoot");
  assert.match(handler?.action?.shotType || "", /^jumpShot/);
  assert.ok(handler.action.quality >= 0.7);
});

test("CPU always produces a shot before the clock expires", () => {
  const director = createAIDirector({ difficulty: "rookie", seed: 8 });
  const snapshot = shootingSnapshot({ shotClock: 1.8, defenderX: 1.2 });
  const intents = director.update(0.1, snapshot);
  const handler = intents.find((intent) => intent.playerId === "cpu-handler");
  assert.equal(handler?.action?.type, "shoot");
  assert.ok(handler.action.quality >= 0.48);
});

test("shooting animation moves from gather to set point and follow-through", () => {
  const gather = getShotAnimationPose(0.04, 4.1, false);
  const apex = getShotAnimationPose(0.42, 0.08, false);
  const follow = getShotAnimationPose(0.18, -1.2, true);
  assert.ok(apex.setPoint > gather.setPoint);
  assert.ok(follow.followThrough > 0.9);
  assert.ok(gather.kneeBend > apex.kneeBend);
});
