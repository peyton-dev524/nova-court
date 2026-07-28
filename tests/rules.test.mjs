import test from "node:test";
import assert from "node:assert/strict";
import { createGameMode, MODE_IDS, MODE_PHASES } from "../js/modes.js";
import { createAIDirector, DIFFICULTY_PRESETS } from "../js/ai.js";

test("street duel runs check, live play, scoring, and make-it-take-it flow", () => {
  const mode = createGameMode(MODE_IDS.STREET_1V1, {
    targetScore: 3,
    winBy: 1,
    checkDelay: 0.01,
  });
  const opening = mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  assert.equal(mode.phase, MODE_PHASES.CHECK);
  assert.ok(opening.commands.some((command) => command.type === "BEGIN_CHECK"));

  mode.handleEvent("CHECK_COMPLETE", { offenseTeamId: "home" });
  assert.equal(mode.phase, MODE_PHASES.LIVE);
  const score = mode.handleEvent("BASKET", { teamId: "home", points: 2 });
  assert.equal(mode.getState().scores.home, 2);
  assert.ok(score.commands.some((command) => command.type === "BEGIN_CHECK"));
  assert.equal(mode.getState().possessionTeamId, "home");
});

test("arc run advances a real five-rack contest and values money balls", () => {
  const mode = createGameMode(MODE_IDS.THREE_POINT_CONTEST, {
    countdown: 0.01,
    duration: 60,
    targetScore: 1,
  });
  mode.start({ userTeamId: "home" });
  const live = mode.update(0.02);
  assert.equal(mode.phase, MODE_PHASES.LIVE);
  assert.ok(live.commands.some((command) => command.type === "SPAWN_RACK_BALL"));

  mode.handleEvent("SHOT_ATTEMPT", { shotId: "opening" });
  const made = mode.handleEvent("BASKET", { shotId: "opening", perfectRelease: true });
  assert.equal(mode.getState().attempts, 1);
  assert.equal(mode.getState().makes, 1);
  assert.equal(mode.getState().score, 1);
  assert.ok(made.commands.some((command) => command.type === "CONTEST_SHOT_RESOLVED"));
});

test("half-court threes tracks passes, scores, and possession checks", () => {
  const mode = createGameMode(MODE_IDS.HALF_COURT_3V3, {
    targetScore: 3,
    winBy: 1,
    checkDelay: 0.01,
  });
  mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  mode.handleEvent("CHECK_COMPLETE", { offenseTeamId: "home" });
  assert.equal(mode.phase, MODE_PHASES.LIVE);
  mode.handleEvent("PASS_COMPLETE", { teamId: "home", playerId: "ace", targetPlayerId: "lyric" });
  assert.equal(mode.getState().passChainLength, 1);
  mode.handleEvent("BASKET", { teamId: "home", playerId: "lyric", points: 2 });
  assert.equal(mode.getState().scores.home, 2);
  assert.equal(mode.getState().possessionTeamId, "away");
});

test("AI director emits readable, bounded intents for offense and defense", () => {
  const director = createAIDirector({ difficulty: "pro", seed: 42, debug: true });
  const snapshot = {
    players: [
      { id: "human", teamId: "home", position: { x: 0, z: 3 }, hasBall: true, isHuman: true },
      { id: "wing", teamId: "home", position: { x: -3, z: 0 }, role: "wing", aiEnabled: true },
      { id: "shade", teamId: "away", position: { x: 0.5, z: 1.5 }, role: "handler", aiEnabled: true },
      { id: "onyx", teamId: "away", position: { x: 3, z: -1 }, role: "big", aiEnabled: true },
    ],
    ball: { position: { x: 0, z: 3 }, holderId: "human", isLoose: false, airborne: false },
    offenseTeamId: "home",
    phase: "live",
    possessionId: 1,
    shotClock: 10,
    attackBaskets: { home: { x: 0, z: -6 }, away: { x: 0, z: -6 } },
    court: { halfWidth: 7.5, halfLength: 7, threePointRadius: 6.15 },
  };
  const intents = director.update(1 / 60, snapshot);
  assert.equal(intents.length, 3);
  assert.ok(intents.every((intent) => Number.isFinite(intent.move.target.x)));
  assert.ok(intents.every((intent) => intent.move.speed >= 0 && intent.move.speed <= 1));
  assert.ok(intents.some((intent) => intent.state.includes("defense") || ["deny", "help"].includes(intent.state)));
});

test("difficulty presets materially change reaction and defensive tuning", () => {
  assert.ok(DIFFICULTY_PRESETS.allStar.reactionSeconds < DIFFICULTY_PRESETS.rookie.reactionSeconds);
  assert.ok(DIFFICULTY_PRESETS.allStar.contestRange > DIFFICULTY_PRESETS.rookie.contestRange);
  assert.ok(DIFFICULTY_PRESETS.allStar.errorRate < DIFFICULTY_PRESETS.rookie.errorRate);
});
