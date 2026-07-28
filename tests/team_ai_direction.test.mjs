import test from "node:test";
import assert from "node:assert/strict";

import { createAIDirector } from "../js/ai.js";
import {
  TEAM_FORMAT_IDS,
  createTeamRoster,
  getAttackBaskets,
  getTeamFormat,
} from "../js/team-formats.js";

function snapshot(overrides = {}) {
  const format = getTeamFormat(TEAM_FORMAT_IDS.FULL_FIVE);
  const players = createTeamRoster(TEAM_FORMAT_IDS.FULL_FIVE).map((player) => ({
    id: player.id,
    teamId: player.team,
    position: { x: player.position.x, z: player.position.z },
    velocity: { x: 0, z: 0 },
    hasBall: player.id === "home-ace",
    role: player.role,
    height: player.height,
    shooting: player.shooting,
    stamina: 1,
    isHuman: player.controlled,
    aiEnabled: !player.controlled,
  }));
  return {
    players,
    ball: { holderId: "home-ace", position: { x: 0, z: 8.6 }, isLoose: false, airborne: false },
    offenseTeamId: "home",
    attackBaskets: getAttackBaskets(TEAM_FORMAT_IDS.FULL_FIVE),
    court: {
      halfWidth: format.court.halfWidth,
      halfLength: format.court.halfLength,
      threePointRadius: format.court.threePointRadius,
    },
    phase: "live",
    shotClock: 18,
    gameClock: 220,
    possessionId: 1,
    ...overrides,
  };
}

test("five-player AI spaces offense toward its assigned hoop", () => {
  const director = createAIDirector({ difficulty: "pro", seed: 17 });
  const intents = director.update(0.1, snapshot());
  const offensive = intents.filter((intent) => intent.playerId.startsWith("home-"));
  assert.equal(offensive.length, 4, "human PG is not AI-controlled");
  assert.ok(offensive.every((intent) => intent.move.target.z < 8.6));
  assert.ok(new Set(offensive.map((intent) => Math.round(intent.move.target.x * 10))).size >= 3);
});

test("defense protects the correct basket and changes direction after turnover", () => {
  const director = createAIDirector({ difficulty: "allStar", seed: 21 });
  const before = director.update(0.1, snapshot());
  const awayBefore = before.filter((intent) => intent.playerId.startsWith("away-"));
  assert.ok(awayBefore.some((intent) => intent.move.target.z < 6.7));

  const next = snapshot({
    offenseTeamId: "away",
    possessionId: 2,
    ball: { holderId: "away-shade", position: { x: 0, z: -4 }, isLoose: false, airborne: false },
  });
  next.players = next.players.map((player) => ({
    ...player,
    hasBall: player.id === "away-shade",
  }));
  const after = director.update(0.1, next);
  const awayOffense = after.filter((intent) => intent.playerId.startsWith("away-"));
  assert.ok(awayOffense.some((intent) => intent.move.target.z > -4));
});

test("airborne miss creates rebound and transition-safety decisions", () => {
  const director = createAIDirector({ difficulty: "pro", seed: 29 });
  const miss = snapshot({
    ball: {
      holderId: null,
      position: { x: 0.4, z: -12.2 },
      velocity: { x: 0.2, z: 1.1 },
      isLoose: false,
      airborne: true,
      isShotResolved: false,
    },
  });
  miss.players = miss.players.map((player) => ({ ...player, hasBall: false }));
  const intents = director.update(0.1, miss);
  assert.ok(intents.some((intent) => intent.state === "rebound"));
  assert.ok(intents.some((intent) => intent.state.includes("transition")));
});

