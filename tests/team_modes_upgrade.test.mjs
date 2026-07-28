import test from "node:test";
import assert from "node:assert/strict";

import { createAIDirector, DIFFICULTY_PRESETS } from "../js/ai.js";
import { getTeamCameraContract } from "../js/court-runtime.js";
import { createFullCourtFiveOnFiveMode, FULL_COURT_PHASES } from "../js/full-court-mode.js";
import { createHalfCourtDuosMode } from "../js/half-court-duos-mode.js";
import { createHalfCourtQuadsMode } from "../js/half-court-quads-mode.js";
import { createGameMode, getModeCatalog, MODE_IDS, MODE_PHASES } from "../js/modes.js";
import {
  COURT_SPECS,
  createTeamRoster,
  getTeamFormat,
  isOutsideCourt,
  restartSpotForTeam,
  TEAM_FORMAT_IDS,
} from "../js/team-formats.js";
import { allowsRestart, cameraPresetForTeamMode } from "../js/team-mode-ui.js";

function startHalf(mode) {
  mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  mode.handleEvent("CHECK_COMPLETE", { offenseTeamId: "home" });
  assert.equal(mode.phase, MODE_PHASES.LIVE);
  return mode;
}

test("4v4 has a complete catalog, roster, rules, clock, and finish path", () => {
  const format = getTeamFormat(TEAM_FORMAT_IDS.QUADS);
  assert.equal(format.playersPerTeam, 4);
  assert.equal(format.shotClock, 21);
  assert.equal(createTeamRoster(format.id).length, 8);
  assert.ok(getModeCatalog().some((entry) => entry.id === MODE_IDS.HALF_COURT_4V4));

  const mode = startHalf(createHalfCourtQuadsMode({ targetScore: 1, winBy: 1 }));
  assert.equal(mode.getRules().playersPerTeam, 4);
  assert.equal(mode.getAIContext().style, "team_half_court");
  mode.handleEvent("BASKET", { teamId: "home", playerId: "home-ace", points: 1 });
  assert.equal(mode.phase, MODE_PHASES.FINISHED);
  assert.equal(mode.getState().result.outcome, "win");
});

test("every competitive team format uses a 21-second clock and resets on changes", () => {
  const halfModes = [
    createHalfCourtDuosMode(),
    createGameMode(MODE_IDS.HALF_COURT_3V3),
    createHalfCourtQuadsMode(),
  ];
  for (const mode of halfModes) {
    startHalf(mode);
    assert.equal(mode.getRules().shotClock, 21);
    mode.update(1.25);
    assert.ok(mode.getState().shotClock < 21);
    mode.handleEvent("TURNOVER", { teamId: "away" });
    assert.equal(mode.getState().shotClock, 21);
    assert.equal(mode.getState().possessionTeamId, "away");
  }

  const fives = createFullCourtFiveOnFiveMode({ inboundDelay: 0.01 });
  fives.start();
  fives.update(0.02);
  assert.equal(fives.getRules().shotClock, 21);
  fives.update(1);
  fives.handleEvent("STEAL", { teamId: "away" });
  assert.equal(fives.getState().shotClock, 21);
});

test("shot-clock expiry turns the ball over in half and full court", () => {
  const half = startHalf(createHalfCourtQuadsMode());
  half.handleEvent("SHOT_CLOCK_EXPIRED");
  assert.equal(half.getState().possessionTeamId, "away");
  assert.equal(half.getState().shotClock, 21);

  const full = createFullCourtFiveOnFiveMode({ inboundDelay: 0.01 });
  full.start();
  full.update(0.02);
  for (let tick = 0; tick < 212; tick += 1) full.update(0.1);
  assert.equal(full.getState().possessionTeamId, "away");
  assert.ok(full.getState().shotClock > 20.7);
});

test("foul and out-of-bounds restarts require a teammate inbound pass", () => {
  for (const mode of [
    createHalfCourtDuosMode(),
    createGameMode(MODE_IDS.HALF_COURT_3V3),
    createHalfCourtQuadsMode(),
  ]) {
    startHalf(mode);
    const dead = mode.handleEvent("OUT_OF_BOUNDS", {
      awardedTeamId: "away",
      boundary: "right",
    });
    assert.equal(mode.phase, MODE_PHASES.INBOUND);
    assert.ok(dead.commands.some((command) => command.type === "BEGIN_INBOUND"));
    mode.update(10);
    assert.equal(mode.phase, MODE_PHASES.INBOUND, "time cannot bypass inbound pass");
    assert.equal(mode.handleEvent("PASS_COMPLETE", {
      teamId: "away",
      fromPlayerId: "away-shade",
      toPlayerId: "away-shade",
    }).accepted, false);
    assert.equal(mode.handleEvent("PASS_COMPLETE", {
      teamId: "away",
      fromPlayerId: "away-shade",
      toPlayerId: "away-rift",
    }).accepted, true);
    assert.equal(mode.phase, MODE_PHASES.LIVE);
  }

  const full = createFullCourtFiveOnFiveMode({ inboundDelay: 0.01 });
  full.start();
  full.update(0.02);
  const foul = full.handleEvent("FOUL", { offendedTeamId: "home", boundary: "left" });
  assert.equal(full.phase, FULL_COURT_PHASES.INBOUND);
  assert.equal(full.getState().inboundRequiresPass, true);
  assert.ok(foul.commands.some((command) => command.type === "BEGIN_INBOUND"));
  full.update(10);
  assert.equal(full.phase, FULL_COURT_PHASES.INBOUND);
  full.handleEvent("PASS_COMPLETE", {
    teamId: "home",
    fromPlayerId: "home-ace",
    toPlayerId: "home-lyric",
  });
  assert.equal(full.phase, FULL_COURT_PHASES.LIVE);
});

test("inbound spots place the inbounder outside the correct boundary", () => {
  const halfSpot = restartSpotForTeam(TEAM_FORMAT_IDS.QUADS, "home", "right");
  assert.equal(isOutsideCourt(TEAM_FORMAT_IDS.QUADS, halfSpot), true);
  assert.ok(halfSpot.x > 0);
  const homeBaseline = restartSpotForTeam(TEAM_FORMAT_IDS.FULL_FIVE, "home", "baseline");
  const awayBaseline = restartSpotForTeam(TEAM_FORMAT_IDS.FULL_FIVE, "away", "baseline");
  assert.ok(homeBaseline.z > COURT_SPECS.full.halfLength);
  assert.ok(awayBaseline.z < -COURT_SPECS.full.halfLength);
});

test("5v5 uses a materially larger two-hoop court and stable team cameras", () => {
  assert.ok(COURT_SPECS.full.width >= 18);
  assert.ok(COURT_SPECS.full.length >= 32);
  assert.ok(COURT_SPECS.full.baskets.home.z < -14);
  assert.ok(COURT_SPECS.full.baskets.away.z > 14);
  for (const key of ["duos", "team", "quads", "fives"]) {
    const contract = getTeamCameraContract(key);
    assert.equal(contract.mode, "broadcast");
    assert.equal(contract.includesActiveBasket, true);
    assert.equal(contract.preservesManualCycle, true);
    assert.ok(contract.maxFov > contract.minFov);
    assert.ok(contract.lateralOffset > getTeamFormat(
      key === "duos" ? TEAM_FORMAT_IDS.DUOS
        : key === "team" ? TEAM_FORMAT_IDS.TRIOS
          : key === "quads" ? TEAM_FORMAT_IDS.QUADS
            : TEAM_FORMAT_IDS.FULL_FIVE,
    ).court.halfWidth, "camera stays outside play bounds to avoid clipping");
    assert.equal(cameraPresetForTeamMode(key).mode, "broadcast");
  }
});

test("five difficulties tune reaction, shooting decisions, and defense monotonically", () => {
  assert.deepEqual(Object.keys(DIFFICULTY_PRESETS), [
    "rookie",
    "starter",
    "pro",
    "allStar",
    "legend",
  ]);
  const ordered = Object.values(DIFFICULTY_PRESETS);
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(ordered[index].reactionSeconds < ordered[index - 1].reactionSeconds);
    assert.ok(ordered[index].contestRange > ordered[index - 1].contestRange);
    assert.ok(ordered[index].passingVision > ordered[index - 1].passingVision);
    assert.ok(ordered[index].errorRate < ordered[index - 1].errorRate);
  }
});

test("AI escapes corners, avoids handle spam, and gets urgent late-clock shots up", () => {
  const base = {
    players: [
      {
        id: "handler",
        teamId: "home",
        position: { x: 7.05, z: 6.55 },
        hasBall: true,
        aiEnabled: true,
        shooting: 0.82,
        stamina: 1,
      },
      {
        id: "wing",
        teamId: "home",
        position: { x: 0, z: 1 },
        aiEnabled: true,
        shooting: 0.8,
      },
      {
        id: "defender",
        teamId: "away",
        position: { x: 6.4, z: 6.1 },
        aiEnabled: true,
      },
    ],
    ball: { holderId: "handler", position: { x: 7.05, z: 6.55 }, isLoose: false },
    offenseTeamId: "home",
    attackBaskets: { home: { x: 0, z: -5.7 }, away: { x: 0, z: -5.7 } },
    court: { halfWidth: 7.5, halfLength: 7, threePointRadius: 6.15 },
    phase: "live",
    possessionId: 1,
    shotClock: 12,
  };
  const director = createAIDirector({ difficulty: "pro", seed: 44, debug: true });
  let handlerIntent;
  const dribbleMoves = [];
  for (let tick = 0; tick < 20; tick += 1) {
    handlerIntent = director.update(0.1, base).find((intent) => intent.playerId === "handler");
    if (handlerIntent.action?.type === "dribbleMove") dribbleMoves.push(handlerIntent.action.move);
  }
  assert.equal(handlerIntent.debug.cornerEscape, true);
  assert.ok(Math.abs(handlerIntent.move.target.x) < Math.abs(base.players[0].position.x));
  assert.ok(dribbleMoves.length <= 3, "handle cooldown prevents per-tick spam");

  const urgent = structuredClone(base);
  urgent.players[0].position = { x: 0, z: -1.6 };
  urgent.players[2].position = { x: 5, z: 2 };
  urgent.ball.position = { ...urgent.players[0].position };
  urgent.shotClock = 1.4;
  urgent.possessionId = 2;
  let shot = null;
  for (let tick = 0; tick < 8 && !shot; tick += 1) {
    shot = director.update(0.1, urgent)
      .find((intent) => intent.playerId === "handler" && intent.action?.type === "shoot");
  }
  assert.ok(shot, "late-clock AI chooses a shot instead of freezing");
  assert.ok(["jumpShot2", "jumpShot3", "layup", "dunk"].includes(shot.action.shotType));

  const rimAttack = structuredClone(urgent);
  rimAttack.players[0].position = { x: 0, z: -4.45 };
  rimAttack.players[2].position = { x: 4, z: 0 };
  rimAttack.ball.position = { ...rimAttack.players[0].position };
  rimAttack.shotClock = 9;
  rimAttack.possessionId = 3;
  const rimDirector = createAIDirector({ difficulty: "pro", seed: 9 });
  let finish = null;
  for (let tick = 0; tick < 8 && !finish; tick += 1) {
    finish = rimDirector.update(0.1, rimAttack)
      .find((intent) => intent.playerId === "handler" && intent.action?.type === "shoot");
  }
  assert.equal(finish?.action.shotType, "dunk", "open close AI attacks with a contextual dunk");

  rimAttack.players[2].position = { x: 0.25, z: -4.3 };
  rimAttack.possessionId = 4;
  const contestedDirector = createAIDirector({ difficulty: "pro", seed: 9 });
  let contestedDecision = null;
  for (let tick = 0; tick < 8 && !contestedDecision; tick += 1) {
    contestedDecision = contestedDirector.update(0.1, rimAttack)
      .find((intent) => intent.playerId === "handler" && intent.action)?.action;
  }
  assert.notEqual(contestedDecision?.shotType, "dunk", "traffic removes the automatic dunk");
  assert.ok(["pass", "dribbleMove", "shoot"].includes(contestedDecision?.type));
});

test("restart and rematch affordances are exclusive to 1v1", () => {
  assert.equal(allowsRestart("street"), true);
  for (const key of ["duos", "team", "quads", "fives", "threePoint", "practice"]) {
    assert.equal(allowsRestart(key), false);
  }
});
