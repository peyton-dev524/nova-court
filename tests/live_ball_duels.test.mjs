import test from "node:test";
import assert from "node:assert/strict";
import {
  DRIBBLE_LEVERAGE,
  STEAL_OUTCOMES,
  calculateAnkleBreakRisk,
  calculateLooseBallDeflection,
  calculatePokeProbability,
  getDribbleMoveLeverage,
  predictLooseBallRoll,
  rankPickupRace,
  resolveLiveBallSteal,
  resolvePickupOpportunity,
} from "../js/live-ball-duels.js";

const owner = {
  id: "ace",
  teamId: "home",
  position: { x: 0, z: 0 },
  velocity: { x: 2.5, z: -2 },
  handleRating: 0.82,
  ballSecurity: 0.78,
  stamina: 0.9,
};

const defender = {
  id: "shade",
  teamId: "away",
  position: { x: 0.8, z: 0.2 },
  velocity: { x: -1, z: 0 },
  stealRating: 0.76,
  balance: 0.68,
  discipline: 0.7,
  reach: 0.75,
  stamina: 0.85,
};

test("all authored dribble moves expose bounded timing leverage", () => {
  for (const [move, config] of Object.entries(DRIBBLE_LEVERAGE)) {
    const sweet = getDribbleMoveLeverage(move, config.sweetSpot);
    const edge = getDribbleMoveLeverage(move, 0);
    assert.equal(sweet.active, true);
    assert.ok(sweet.leverage > edge.leverage, move);
    assert.ok(sweet.leverage >= 0 && sweet.leverage <= 1);
  }
  assert.equal(getDribbleMoveLeverage("unknown").active, false);
});

test("ankle risk rewards move leverage, timing, handler edge, and wrong-foot momentum", () => {
  const safe = calculateAnkleBreakRisk({
    dribbleMove: "hesi",
    dribbleProgress: 0,
    handlerRating: 0.5,
    moveExecution: 0.4,
    defenderBalance: 0.95,
    defenderDiscipline: 0.95,
    reachAggression: 0.2,
  });
  const broken = calculateAnkleBreakRisk({
    dribbleMove: "shamgod",
    dribbleProgress: DRIBBLE_LEVERAGE.shamgod.sweetSpot,
    handlerRating: 1,
    handlerSpeed: 1,
    moveExecution: 1,
    defenderBalance: 0,
    defenderDiscipline: 0,
    reachAggression: 1,
    defenderWrongFoot: true,
  });
  assert.ok(broken.risk > safe.risk + 0.6);
  assert.ok(broken.stunSeconds > safe.stunSeconds);
});

test("maximum ankle-break stun is exactly 1.5 seconds", () => {
  const result = calculateAnkleBreakRisk({
    dribbleMove: "shamgod",
    dribbleProgress: DRIBBLE_LEVERAGE.shamgod.sweetSpot,
    handlerRating: 1,
    handlerSpeed: 1,
    moveExecution: 1,
    defenderBalance: 0,
    defenderDiscipline: 0,
    defenderMomentum: 1,
    reachAggression: 1,
    defenderWrongFoot: true,
  });
  assert.equal(result.risk, 1);
  assert.equal(result.stunSeconds, 1.5);
});

test("active dribble leverage protects the ball from clean pokes", () => {
  const exposed = calculatePokeProbability({
    distance: 0.7,
    alignment: 1,
    reachTiming: 0.9,
    ballExposure: 0.8,
    defenderStealRating: 0.8,
    handlerBallSecurity: 0.7,
  });
  const moveProtected = calculatePokeProbability({
    distance: 0.7,
    alignment: 1,
    reachTiming: 0.9,
    ballExposure: 0.8,
    defenderStealRating: 0.8,
    handlerBallSecurity: 0.7,
    dribbleMove: "shamgod",
    dribbleProgress: DRIBBLE_LEVERAGE.shamgod.sweetSpot,
  });
  assert.ok(exposed.probability > moveProtected.probability);
  assert.ok(moveProtected.moveProtection > 0.8);
});

test("successful steal attempt pokes the ball loose without assigning possession", () => {
  const result = resolveLiveBallSteal({
    owner,
    defender,
    ball: { position: { x: 0.35, y: 0.7, z: -0.1 } },
    alignment: 0.9,
    reachTiming: 0.9,
    ballExposure: 1,
    ballFirst: true,
    foulCheckValue: 1,
    ankleCheckValue: 1,
    pokeCheckValue: 0,
  });
  assert.equal(result.outcome, STEAL_OUTCOMES.LOOSE_BALL);
  assert.equal(result.event.type, "BALL_POKED_LOOSE");
  assert.equal(result.event.lastTouchPlayerId, owner.id);
  assert.equal(result.event.lastTouchTeamId, owner.teamId);
  assert.equal(result.automaticPossession, false);
  assert.equal(result.looseBall.state, "loose");
  assert.ok(Number.isFinite(result.looseBall.velocity.x));
  assert.ok(result.commands.some((command) =>
    command.type === "RELEASE_BALL_LOOSE" && command.automaticPossession === false));
  assert.ok(!result.commands.some((command) =>
    ["SET_POSSESSION", "BEGIN_CHECK"].includes(command.type)));
});

test("loose-ball deflection preserves owner last-touch and has roll velocity", () => {
  const result = calculateLooseBallDeflection({
    ballPosition: { x: 0.2, y: 0.6, z: 0 },
    ownerPosition: owner.position,
    defenderPosition: defender.position,
    ownerVelocity: owner.velocity,
    ownerId: owner.id,
    ownerTeamId: owner.teamId,
    pokeSide: -1,
    pokeStrength: 0.8,
  });
  assert.equal(result.lastTouchPlayerId, "ace");
  assert.equal(result.lastTouchTeamId, "home");
  assert.equal(result.automaticPossession, false);
  assert.ok(Math.hypot(result.velocity.x, result.velocity.z) > 2);
  assert.ok(result.pickupDelay > 0);
});

test("an active move can punish a reach with a deterministic capped stun", () => {
  const result = resolveLiveBallSteal({
    owner: { ...owner, handleRating: 1 },
    defender: {
      ...defender,
      balance: 0,
      discipline: 0,
      reachAggression: 1,
      velocity: { x: 5, z: 0 },
    },
    dribbleMove: "shamgod",
    dribbleProgress: DRIBBLE_LEVERAGE.shamgod.sweetSpot,
    moveExecution: 1,
    defenderWrongFoot: true,
    foulCheckValue: 1,
    ankleCheckValue: 0,
    pokeCheckValue: 1,
  });
  assert.equal(result.outcome, STEAL_OUTCOMES.ANKLE_BREAK);
  assert.equal(result.event.type, "ANKLE_BREAK");
  assert.ok(result.stunSeconds > 0);
  assert.ok(result.stunSeconds <= 1.5);
  assert.equal(result.commands[0].type, "STUN_DEFENDER");
});

test("normal reach-in foul remains possible during an active dribble move", () => {
  const result = resolveLiveBallSteal({
    owner,
    defender,
    dribbleMove: "doubleCross",
    dribbleProgress: 0.62,
    distance: 1.6,
    alignment: -0.8,
    fromBehind: true,
    handContact: 1,
    bodyContact: 0.8,
    victimProtectingBall: true,
    foulCheckValue: 0,
    ankleCheckValue: 0,
    pokeCheckValue: 0,
  });
  assert.equal(result.outcome, STEAL_OUTCOMES.FOUL);
  assert.equal(result.event.type, "FOUL");
  assert.equal(result.event.foulType, "reach_in");
  assert.ok(result.foulRisk > 0.7);
});

test("a disciplined miss creates neither possession nor dead-ball commands", () => {
  const result = resolveLiveBallSteal({
    owner,
    defender: { ...defender, stealRating: 0.2 },
    distance: 1.6,
    alignment: -0.5,
    reachTiming: 0.2,
    ballExposure: 0.1,
    ballFirst: true,
    foulCheckValue: 1,
    ankleCheckValue: 1,
    pokeCheckValue: 1,
  });
  assert.equal(result.outcome, STEAL_OUTCOMES.MISSED_REACH);
  assert.equal(result.commands.length, 0);
  assert.equal(result.automaticPossession, false);
});

test("same-team and absent targets are rejected deterministically", () => {
  assert.equal(resolveLiveBallSteal({ owner, defender: null }).outcome, STEAL_OUTCOMES.NO_TARGET);
  assert.equal(resolveLiveBallSteal({
    owner,
    defender: { ...defender, teamId: owner.teamId },
  }).outcome, STEAL_OUTCOMES.NO_TARGET);
});

test("roll prediction slows planar velocity and remains finite", () => {
  const ball = {
    position: { x: 0, y: 0.6, z: 0 },
    velocity: { x: 5, y: 0.4, z: -2 },
  };
  const early = predictLooseBallRoll(ball, 0.1);
  const later = predictLooseBallRoll(ball, 0.6);
  assert.ok(later.position.x > early.position.x);
  assert.ok(Math.abs(later.velocity.x) < Math.abs(early.velocity.x));
  assert.ok(Object.values(later.position).every(Number.isFinite));
});

test("pickup race ranks ETA, ratings, momentum, and stun deterministically", () => {
  const candidates = [
    {
      id: "quick",
      teamId: "home",
      position: { x: 0.9, z: 0 },
      velocity: { x: -2, z: 0 },
      speed: 5,
      reactionSeconds: 0.12,
      hustle: 0.9,
      looseBall: 0.85,
    },
    {
      id: "stunned",
      teamId: "away",
      position: { x: 0.3, z: 0 },
      speed: 5,
      reactionSeconds: 0.1,
      hustle: 1,
      looseBall: 1,
      stunSeconds: 1.2,
    },
  ];
  const context = {
    ball: { position: { x: 0, y: 0.3, z: 0 }, velocity: { x: 0.5, y: 0, z: 0 } },
  };
  const first = rankPickupRace(candidates, context);
  const second = rankPickupRace(candidates, context);
  assert.deepEqual(first, second);
  assert.equal(first[0].playerId, "quick");
  assert.ok(Math.abs(first.reduce((sum, item) => sum + item.share, 0) - 1) < 1e-12);
});

test("pickup opportunity never assigns possession automatically", () => {
  const result = resolvePickupOpportunity([
    {
      id: "ace",
      teamId: "home",
      position: { x: 0.1, z: 0 },
      speed: 4,
      reactionSeconds: 0.1,
    },
  ], {
    ball: { position: { x: 0, y: 0.4, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
    pickupRadius: 0.8,
  });
  assert.equal(result.ready, true);
  assert.equal(result.candidatePlayerId, "ace");
  assert.equal(result.automaticPossession, false);
  assert.equal(result.commands.length, 0);
  assert.equal(result.event.automaticPossession, false);
});

test("high or distant ball does not produce a premature pickup", () => {
  const candidate = {
    id: "ace",
    teamId: "home",
    position: { x: 3, z: 0 },
    speed: 4,
  };
  const high = resolvePickupOpportunity([candidate], {
    ball: { position: { x: 3, y: 2.5, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
  });
  const distant = resolvePickupOpportunity([candidate], {
    ball: { position: { x: 0, y: 0.4, z: 0 }, velocity: { x: 0, y: 0, z: 0 } },
  });
  assert.equal(high.ready, false);
  assert.equal(distant.ready, false);
});
