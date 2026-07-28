import test from "node:test";
import assert from "node:assert/strict";
import {
  BOUNDARY_TYPES,
  FOUL_TYPES,
  RESTART_TYPES,
  RULESET_IDS,
  classifyContact,
  createRulesEvent,
  detectOutOfBounds,
  estimateStealFoulRisk,
  evaluateBoxOut,
  rankReboundCandidates,
  resolveContactFoul,
  resolveFoulConsequences,
  resolveOutOfBounds,
} from "../js/contact-rules.js";

test("sideline crossing is detected at an interpolated radius-safe point", () => {
  const result = detectOutOfBounds({
    previousPosition: { x: 7, z: 1 },
    position: { x: 8, z: 2 },
    court: { halfWidth: 7.5, halfLength: 7 },
    radius: 0.12,
  });
  assert.equal(result.outOfBounds, true);
  assert.equal(result.boundary, BOUNDARY_TYPES.SIDELINE);
  assert.equal(result.side, "right");
  assert.ok(Math.abs(result.crossing.x - 7.38) < 1e-10);
  assert.ok(Math.abs(result.crossing.z - 1.38) < 1e-10);
  assert.ok(result.restartSpot.x < result.crossing.x);
});

test("baseline detection handles a sample that was already outside", () => {
  const result = detectOutOfBounds({
    previousPosition: { x: 0.2, z: -7.2 },
    position: { x: 0.3, z: -7.8 },
    court: { width: 15, length: 14 },
  });
  assert.equal(result.boundary, BOUNDARY_TYPES.BASELINE);
  assert.equal(result.side, "near");
  assert.deepEqual(result.crossing, { x: 0.3, z: -7 });
  assert.ok(result.overshoot > 0.79);
});

test("an in-bounds sample creates no dead-ball result", () => {
  const detection = detectOutOfBounds({
    previousPosition: { x: 2, z: 1 },
    position: { x: 7.49, z: 6.99 },
  });
  assert.equal(detection.outOfBounds, false);
  const resolution = resolveOutOfBounds({ detection });
  assert.equal(resolution.occurred, false);
  assert.equal(resolution.commands.length, 0);
});

test("competitive out of bounds awards the opponent and begins a check", () => {
  const result = resolveOutOfBounds({
    position: { x: -7.8, z: 2 },
    previousPosition: { x: -7.2, z: 2 },
    modeId: RULESET_IDS.HALF_COURT_3V3,
    teamIds: ["home", "away"],
    possessionTeamId: "home",
    lastTouchedTeamId: "home",
    lastTouchedPlayerId: "ace",
    possessionId: 8,
    sequence: 2,
  });
  assert.equal(result.event.type, "OUT_OF_BOUNDS");
  assert.equal(result.event.id, "out_of_bounds:8:2");
  assert.equal(result.event.awardedTeamId, "away");
  assert.equal(result.consequence.restartType, RESTART_TYPES.CHECK);
  assert.ok(result.commands.some((command) =>
    command.type === "BEGIN_CHECK" && command.offenseTeamId === "away"));
});

test("practice returns the ball while the contest replays an uncounted ball", () => {
  const input = {
    position: { x: 8, z: 0 },
    previousPosition: { x: 7, z: 0 },
    possessionTeamId: "home",
    lastTouchedTeamId: "home",
  };
  const practice = resolveOutOfBounds({ ...input, modeId: RULESET_IDS.PRACTICE });
  const contest = resolveOutOfBounds({ ...input, modeId: RULESET_IDS.THREE_POINT_CONTEST });
  assert.equal(practice.consequence.restartType, RESTART_TYPES.BALL_RETURN);
  assert.equal(practice.consequence.deadBall, false);
  assert.ok(practice.commands.some((command) => command.type === "RETURN_BALL"));
  assert.ok(!practice.commands.some((command) => command.type === "WHISTLE"));
  assert.equal(contest.consequence.replayAttempt, true);
  assert.ok(contest.commands.some((command) =>
    command.type === "REPLAY_CONTEST_BALL" && command.countAttempt === false));
});

test("steal foul risk reacts to position, contact, protection, and ball-first timing", () => {
  const clean = estimateStealFoulRisk({
    distance: 0.8,
    alignment: 1,
    handContact: 0.05,
    bodyContact: 0,
    timing: 0.5,
    ballExposed: 1,
    ballFirst: true,
    defenderRating: 0.9,
  });
  const reckless = estimateStealFoulRisk({
    distance: 1.7,
    alignment: -0.8,
    fromBehind: true,
    handContact: 0.9,
    bodyContact: 0.7,
    timing: 0.05,
    ballExposed: 0.1,
    victimProtectingBall: true,
    fatigue: 1,
    defenderRating: 0.25,
  });
  assert.ok(clean < 0.2);
  assert.ok(reckless > 0.85);
  assert.ok(clean >= 0 && reckless <= 1);
});

test("contact classifier separates a clean poke from a reach-in foul", () => {
  const clean = classifyContact({
    action: "steal",
    ballFirst: true,
    handContact: 0.04,
    bodyContact: 0,
    steal: { distance: 0.75, alignment: 0.9, timing: 0.5, ballExposed: 1 },
  });
  const foul = classifyContact({
    action: "steal",
    fromBehind: true,
    handContact: 1,
    bodyContact: 0.6,
    steal: { distance: 1.5, alignment: -0.7, timing: 0.05, ballExposed: 0.2 },
  });
  assert.equal(clean.type, FOUL_TYPES.NONE);
  assert.equal(clean.cleanPlay, true);
  assert.equal(foul.type, FOUL_TYPES.REACH_IN);
  assert.equal(foul.isFoul, true);
});

test("vertical ball-first block stays clean while airborne body contact is shooting", () => {
  const vertical = classifyContact({
    action: "block",
    contact: 0.4,
    bodyContact: 0.25,
    ballFirst: true,
    defenderVertical: true,
    shooterAirborne: true,
  });
  const body = classifyContact({
    action: "block",
    contact: 0.9,
    bodyContact: 1,
    displacement: 0.8,
    shooterAirborne: true,
    shotReleased: true,
    defenderVertical: false,
  });
  assert.equal(vertical.type, FOUL_TYPES.NONE);
  assert.equal(body.type, FOUL_TYPES.SHOOTING);
});

test("drive contact distinguishes an established charge from a late block", () => {
  const charge = classifyContact({
    action: "drive",
    contact: 0.9,
    bodyContact: 0.9,
    displacement: 0.6,
    defenderEstablished: true,
    attackerInitiated: true,
  });
  const block = classifyContact({
    action: "drive",
    contact: 0.9,
    bodyContact: 0.9,
    displacement: 0.7,
    defenderEstablished: false,
    attackerInitiated: false,
  });
  assert.equal(charge.type, FOUL_TYPES.CHARGING);
  assert.equal(charge.offensive, true);
  assert.equal(block.type, FOUL_TYPES.BLOCKING);
});

test("shooting, bonus, offensive, practice, and contest consequences are explicit", () => {
  const shootingFoul = {
    isFoul: true,
    type: FOUL_TYPES.SHOOTING,
    shooting: true,
    offensive: false,
    offendedTeamId: "home",
  };
  const miss = resolveFoulConsequences(shootingFoul, {
    modeId: RULESET_IDS.HALF_COURT_3V3,
    shotValue: 2,
    shotMade: false,
  });
  const make = resolveFoulConsequences(shootingFoul, {
    modeId: RULESET_IDS.STREET_1V1,
    shotValue: 2,
    shotMade: true,
  });
  const bonus = resolveFoulConsequences({
    ...shootingFoul,
    type: FOUL_TYPES.REACH_IN,
    shooting: false,
  }, { teamFouls: 4, bonusThreshold: 5 });
  const charge = resolveFoulConsequences({
    ...shootingFoul,
    type: FOUL_TYPES.CHARGING,
    shooting: false,
    offensive: true,
  }, { teamIds: ["home", "away"] });
  const practice = resolveFoulConsequences(shootingFoul, {
    modeId: RULESET_IDS.PRACTICE,
  });
  const contest = resolveFoulConsequences(shootingFoul, {
    modeId: RULESET_IDS.THREE_POINT_CONTEST,
  });

  assert.equal(miss.freeThrows, 2);
  assert.equal(make.freeThrows, 1);
  assert.equal(make.countBasket, true);
  assert.equal(bonus.freeThrows, 1);
  assert.equal(charge.awardedTeamId, "away");
  assert.equal(charge.turnover, true);
  assert.equal(practice.ignored, true);
  assert.equal(contest.replayAttempt, true);
});

test("resolved foul emits integration-ready event and free-throw command", () => {
  const result = resolveContactFoul({
    action: "block",
    contact: 1,
    bodyContact: 1,
    displacement: 0.8,
    shooterAirborne: true,
    shotReleased: true,
    committingTeamId: "away",
    committingPlayerId: "shade",
    offendedTeamId: "home",
    offendedPlayerId: "ace",
    modeId: RULESET_IDS.HALF_COURT_3V3,
    shotValue: 2,
    possessionId: 11,
  });
  assert.equal(result.event.type, "FOUL");
  assert.equal(result.event.offendedPlayerId, "ace");
  assert.equal(result.consequence.freeThrows, 2);
  assert.ok(result.commands.some((command) =>
    command.type === "START_FREE_THROWS" && command.attempts === 2));
});

test("resolved practice contact stays silent while retaining classification consequences", () => {
  const result = resolveContactFoul({
    action: "block",
    contact: 1,
    bodyContact: 1,
    shooterAirborne: true,
    modeId: RULESET_IDS.PRACTICE,
    offendedTeamId: "home",
  });
  assert.equal(result.occurred, false);
  assert.equal(result.event, null);
  assert.equal(result.consequence.ignored, true);
  assert.equal(result.commands.length, 0);
});

test("box-out leverage rewards inside position, proximity, and strength", () => {
  const strongInside = evaluateBoxOut({
    rebounder: {
      position: { x: 0, z: -5 },
      facing: { x: 0, z: -1 },
      strength: 0.9,
    },
    opponent: {
      position: { x: 0, z: -4.2 },
      strength: 0.5,
    },
  });
  const farAway = evaluateBoxOut({
    rebounder: { position: { x: 0, z: -5 }, strength: 0.9 },
    opponent: { position: { x: 5, z: 2 }, strength: 0.5 },
  });
  assert.equal(strongInside.active, true);
  assert.ok(strongInside.leverage > farAway.leverage);
  assert.equal(farAway.active, false);
});

test("rebound ranking is deterministic and materially applies box-out penalties", () => {
  const players = [
    {
      id: "atlas",
      teamId: "home",
      role: "big",
      position: { x: 0.3, z: -4.4 },
      velocity: { x: 0, z: -1 },
      rebounding: 0.9,
      vertical: 0.8,
      reach: 0.9,
      grounded: true,
    },
    {
      id: "onyx",
      teamId: "away",
      role: "big",
      position: { x: 0.1, z: -4.5 },
      velocity: { x: 0, z: -1 },
      rebounding: 0.92,
      vertical: 0.82,
      reach: 0.9,
      grounded: true,
    },
    {
      id: "lyric",
      teamId: "home",
      role: "wing",
      position: { x: 4, z: 1 },
      rebounding: 0.5,
    },
  ];
  const ranked = rankReboundCandidates(players, {
    landingPoint: { x: 0, z: -5.1 },
    offenseTeamId: "home",
    boxOuts: {
      atlas: { leverage: 0.9 },
      onyx: { boxedOutByLeverage: 0.9 },
    },
  });
  assert.equal(ranked[0].playerId, "atlas");
  assert.equal(ranked[0].rank, 1);
  assert.ok(ranked[0].share > ranked[1].share);
  assert.ok(Math.abs(ranked.reduce((sum, item) => sum + item.share, 0) - 1) < 1e-12);

  const tied = rankReboundCandidates([
    { id: "zeta", teamId: "home", position: { x: 0, z: 0 } },
    { id: "alpha", teamId: "home", position: { x: 0, z: 0 } },
  ]);
  assert.deepEqual(tied.map((entry) => entry.playerId), ["alpha", "zeta"]);
});

test("rules events are deterministic and immutable", () => {
  const first = createRulesEvent("foul", { offendedTeamId: "home" }, {
    possessionId: 4,
    sequence: 3,
  });
  const second = createRulesEvent("foul", { offendedTeamId: "home" }, {
    possessionId: 4,
    sequence: 3,
  });
  assert.deepEqual(first, second);
  assert.equal(first.id, "foul:4:3");
  assert.equal(Object.isFrozen(first), true);
  assert.throws(() => {
    first.type = "MUTATED";
  }, TypeError);
});
