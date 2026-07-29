/**
 * Pure basketball contact and dead-ball rules for NOVA COURT.
 *
 * The functions in this module deliberately have no Three.js, DOM, clock, or
 * random-number dependency. The engine supplies a snapshot and can forward the
 * returned event to a mode controller, then consume the returned commands.
 */

export const CONTACT_RULES_VERSION = "1.0.0";

export const RULESET_IDS = Object.freeze({
  STREET_1V1: "street_1v1",
  HALF_COURT_3V3: "half_court_3v3",
  THREE_POINT_CONTEST: "three_point_contest",
  PRACTICE: "open_gym",
});

export const BOUNDARY_TYPES = Object.freeze({
  SIDELINE: "sideline",
  BASELINE: "baseline",
});

export const RESTART_TYPES = Object.freeze({
  CHECK: "check",
  BALL_RETURN: "ball_return",
  REPLAY_CONTEST_BALL: "replay_contest_ball",
  FREE_THROWS: "free_throws",
  RESUME: "resume",
});

export const FOUL_TYPES = Object.freeze({
  NONE: "none",
  REACH_IN: "reach_in",
  SHOOTING: "shooting",
  BLOCKING: "blocking",
  CHARGING: "charging",
  PUSH: "push",
  LOOSE_BALL: "loose_ball",
  HOLDING: "holding",
});

export const DEFAULT_COURT = Object.freeze({
  halfWidth: 7.5,
  halfLength: 7,
  inboundOffset: 0.42,
});

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const pointOf = (value) => ({
  x: finite(value?.x),
  z: finite(value?.z),
});

const distance = (a, b) => Math.hypot(
  finite(a?.x) - finite(b?.x),
  finite(a?.z) - finite(b?.z),
);

const normalize = (value) => {
  const p = pointOf(value);
  const length = Math.hypot(p.x, p.z);
  return length > 1e-6 ? { x: p.x / length, z: p.z / length } : { x: 0, z: 0 };
};

const dot = (a, b) => finite(a?.x) * finite(b?.x) + finite(a?.z) * finite(b?.z);
const gameplayRating = (value, fallback = 0.65) => {
  const resolved = finite(value, fallback);
  return clamp(resolved > 1 ? resolved / 100 : resolved);
};

function normalizedCourt(court = DEFAULT_COURT, ballRadius = 0) {
  const halfWidth = Math.max(
    0.5,
    finite(court.halfWidth, finite(court.width, DEFAULT_COURT.halfWidth * 2) / 2),
  );
  const halfLength = Math.max(
    0.5,
    finite(court.halfLength, finite(court.length, DEFAULT_COURT.halfLength * 2) / 2),
  );
  const radius = clamp(finite(ballRadius), 0, Math.min(halfWidth, halfLength) - 0.05);
  return {
    halfWidth,
    halfLength,
    xLimit: halfWidth - radius,
    zLimit: halfLength - radius,
    inboundOffset: clamp(
      finite(court.inboundOffset, DEFAULT_COURT.inboundOffset),
      0.1,
      1.25,
    ),
  };
}

function otherTeam(teamId, teamIds = []) {
  return teamIds.find((candidate) => candidate !== teamId) ?? null;
}

function shallowFreezeArray(items) {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

/**
 * Produces a stable event envelope. Callers should pass `sequence` when more
 * than one event of the same type can occur during a possession.
 */
export function createRulesEvent(type, payload = {}, meta = {}) {
  const normalizedType = String(type || "RULE_EVENT").trim().toUpperCase();
  const possessionId = meta.possessionId ?? payload.possessionId ?? 0;
  const sequence = meta.sequence ?? payload.sequence ?? 0;
  return Object.freeze({
    ...payload,
    id: `${normalizedType.toLowerCase()}:${String(possessionId)}:${String(sequence)}`,
    type: normalizedType,
    version: CONTACT_RULES_VERSION,
    possessionId,
    sequence,
  });
}

export function createRulesResult(event, consequence = {}, commands = []) {
  return Object.freeze({
    occurred: Boolean(event),
    event: event || null,
    consequence: Object.freeze({ ...consequence }),
    commands: shallowFreezeArray(commands),
  });
}

/**
 * Detects the first boundary crossed by a ball/player radius between two
 * simulation samples. Supplying previousPosition prevents tunnelling at low FPS.
 */
export function detectOutOfBounds({
  position,
  previousPosition = position,
  court = DEFAULT_COURT,
  radius = 0,
  epsilon = 1e-6,
} = {}) {
  const current = pointOf(position);
  const previous = pointOf(previousPosition);
  const limits = normalizedCourt(court, radius);
  const outsideX = Math.abs(current.x) > limits.xLimit + Math.abs(epsilon);
  const outsideZ = Math.abs(current.z) > limits.zLimit + Math.abs(epsilon);

  if (!outsideX && !outsideZ) {
    return Object.freeze({
      outOfBounds: false,
      boundary: null,
      side: null,
      crossing: null,
      restartSpot: null,
      overshoot: 0,
      limits: Object.freeze({ x: limits.xLimit, z: limits.zLimit }),
    });
  }

  const dx = current.x - previous.x;
  const dz = current.z - previous.z;
  const candidates = [];
  const pushCandidate = (axis, sign, boundaryValue, delta) => {
    if (Math.abs(delta) <= 1e-9) return;
    const prior = axis === "x" ? previous.x : previous.z;
    const t = (boundaryValue - prior) / delta;
    if (t < -epsilon || t > 1 + epsilon) return;
    const crossing = {
      x: previous.x + dx * clamp(t),
      z: previous.z + dz * clamp(t),
    };
    const other = axis === "x" ? Math.abs(crossing.z) : Math.abs(crossing.x);
    const otherLimit = axis === "x" ? limits.zLimit : limits.xLimit;
    if (other <= otherLimit + epsilon) candidates.push({ axis, sign, t: clamp(t), crossing });
  };

  if (outsideX) pushCandidate("x", Math.sign(current.x) || 1, Math.sign(current.x || 1) * limits.xLimit, dx);
  if (outsideZ) pushCandidate("z", Math.sign(current.z) || 1, Math.sign(current.z || 1) * limits.zLimit, dz);
  candidates.sort((a, b) => a.t - b.t || (a.axis === "x" ? -1 : 1));

  let crossed = candidates[0];
  if (!crossed) {
    const xPenetration = outsideX ? Math.abs(current.x) - limits.xLimit : -Infinity;
    const zPenetration = outsideZ ? Math.abs(current.z) - limits.zLimit : -Infinity;
    const axis = xPenetration >= zPenetration ? "x" : "z";
    const sign = Math.sign(axis === "x" ? current.x : current.z) || 1;
    crossed = {
      axis,
      sign,
      t: 0,
      crossing: {
        x: axis === "x" ? sign * limits.xLimit : clamp(current.x, -limits.xLimit, limits.xLimit),
        z: axis === "z" ? sign * limits.zLimit : clamp(current.z, -limits.zLimit, limits.zLimit),
      },
    };
  }

  const boundary = crossed.axis === "x" ? BOUNDARY_TYPES.SIDELINE : BOUNDARY_TYPES.BASELINE;
  const side = crossed.axis === "x"
    ? (crossed.sign < 0 ? "left" : "right")
    : (crossed.sign < 0 ? "near" : "far");
  const crossing = Object.freeze({
    x: clamp(crossed.crossing.x, -limits.xLimit, limits.xLimit),
    z: clamp(crossed.crossing.z, -limits.zLimit, limits.zLimit),
  });
  const restartSpot = Object.freeze({
    x: boundary === BOUNDARY_TYPES.SIDELINE
      ? crossed.sign * (limits.xLimit - limits.inboundOffset)
      : clamp(crossing.x, -limits.xLimit + 0.6, limits.xLimit - 0.6),
    z: boundary === BOUNDARY_TYPES.BASELINE
      ? crossed.sign * (limits.zLimit - limits.inboundOffset)
      : clamp(crossing.z, -limits.zLimit + 0.6, limits.zLimit - 0.6),
  });
  const overshoot = boundary === BOUNDARY_TYPES.SIDELINE
    ? Math.max(0, Math.abs(current.x) - limits.xLimit)
    : Math.max(0, Math.abs(current.z) - limits.zLimit);

  return Object.freeze({
    outOfBounds: true,
    boundary,
    side,
    crossing,
    restartSpot,
    overshoot,
    crossingTime: crossed.t,
    limits: Object.freeze({ x: limits.xLimit, z: limits.zLimit }),
  });
}

/**
 * Converts boundary detection into a mode-compatible event and deterministic
 * restart plan. The mode controller remains authoritative for possession state.
 */
export function resolveOutOfBounds({
  detection,
  position,
  previousPosition,
  court,
  radius = 0,
  modeId = RULESET_IDS.STREET_1V1,
  teamIds = ["home", "away"],
  possessionTeamId = teamIds[0] ?? null,
  lastTouchedTeamId = possessionTeamId,
  lastTouchedPlayerId = null,
  possessionId = 0,
  sequence = 0,
} = {}) {
  const boundary = detection || detectOutOfBounds({
    position,
    previousPosition,
    court,
    radius,
  });
  if (!boundary.outOfBounds) return createRulesResult(null, { restartType: null }, []);

  const isPractice = modeId === RULESET_IDS.PRACTICE;
  const isContest = modeId === RULESET_IDS.THREE_POINT_CONTEST;
  const awardedTeamId = isPractice || isContest
    ? (possessionTeamId ?? lastTouchedTeamId)
    : (otherTeam(lastTouchedTeamId, teamIds) ?? possessionTeamId);
  const restartType = isPractice
    ? RESTART_TYPES.BALL_RETURN
    : isContest
      ? RESTART_TYPES.REPLAY_CONTEST_BALL
      : RESTART_TYPES.CHECK;
  const event = createRulesEvent("OUT_OF_BOUNDS", {
    boundary: boundary.boundary,
    side: boundary.side,
    crossing: boundary.crossing,
    restartSpot: boundary.restartSpot,
    lastTouchedTeamId,
    lastTouchedPlayerId,
    awardedTeamId,
    modeId,
  }, { possessionId, sequence });

  const commands = isPractice ? [] : [{ type: "WHISTLE", reason: "out_of_bounds" }];
  if (restartType === RESTART_TYPES.BALL_RETURN) {
    commands.push({
      type: "RETURN_BALL",
      teamId: awardedTeamId,
      spot: boundary.restartSpot,
      preserveStreak: true,
    });
  } else if (restartType === RESTART_TYPES.REPLAY_CONTEST_BALL) {
    commands.push({
      type: "REPLAY_CONTEST_BALL",
      teamId: awardedTeamId,
      spot: boundary.restartSpot,
      countAttempt: false,
    });
  } else {
    commands.push({
      type: "BEGIN_CHECK",
      offenseTeamId: awardedTeamId,
      spot: boundary.restartSpot,
      reason: "out_of_bounds",
    });
  }

  return createRulesResult(event, {
    awardedTeamId,
    restartType,
    deadBall: !isPractice,
    replayAttempt: isContest,
  }, commands);
}

/**
 * Estimates foul risk for a steal attempt. This is a deterministic probability
 * estimate, not an RNG roll; the engine can compare it with seeded randomness.
 */
export function estimateStealFoulRisk({
  distance: defenderDistance = 1,
  alignment = 0,
  fromBehind = false,
  handContact = 0,
  bodyContact = 0,
  timing = 0.5,
  ballExposed = 0.5,
  ballFirst = false,
  defenderRating = 0.7,
  fatigue = 0,
  victimProtectingBall = false,
} = {}) {
  const reachDistance = clamp((finite(defenderDistance, 1) - 0.65) / 1.15);
  const badAngle = clamp((1 - finite(alignment)) / 2);
  const earlyOrLate = clamp(Math.abs(clamp(finite(timing, 0.5)) - 0.5) * 2);
  let risk = 0.06;
  risk += reachDistance * 0.22;
  risk += badAngle * 0.13;
  risk += (fromBehind ? 0.23 : 0);
  risk += clamp(finite(handContact)) * 0.32;
  risk += clamp(finite(bodyContact)) * 0.2;
  risk += earlyOrLate * 0.08;
  risk += (1 - clamp(finite(ballExposed, 0.5))) * 0.1;
  risk += (victimProtectingBall ? 0.12 : 0);
  risk += clamp(finite(fatigue)) * 0.08;
  risk -= clamp(finite(defenderRating, 0.7)) * 0.13;
  risk -= (ballFirst ? 0.31 : 0);
  return clamp(risk);
}

function foulRecord(type, risk, details = {}) {
  const isFoul = type !== FOUL_TYPES.NONE;
  return Object.freeze({
    isFoul,
    type,
    risk: clamp(risk),
    confidence: isFoul ? clamp(Math.abs(risk - 0.5) * 1.65 + 0.42) : clamp(1 - risk),
    shooting: type === FOUL_TYPES.SHOOTING,
    offensive: type === FOUL_TYPES.CHARGING,
    ...details,
  });
}

/**
 * Classifies contact from authored collision facts. Collision detection stays in
 * the engine; this function only decides what the contact means.
 */
export function classifyContact({
  action = "incidental",
  contact = 0,
  bodyContact = contact,
  handContact = 0,
  displacement = 0,
  ballFirst = false,
  defenderVertical = false,
  defenderEstablished = false,
  attackerInitiated = false,
  shooterAirborne = false,
  shotReleased = false,
  fromBehind = false,
  holdingSeconds = 0,
  steal = {},
  committingTeamId = null,
  committingPlayerId = null,
  offendedTeamId = null,
  offendedPlayerId = null,
} = {}) {
  const severity = clamp(
    clamp(finite(contact)) * 0.38
      + clamp(finite(bodyContact)) * 0.32
      + clamp(finite(handContact)) * 0.16
      + clamp(finite(displacement)) * 0.34,
  );
  const detail = {
    action,
    severity,
    committingTeamId,
    committingPlayerId,
    offendedTeamId,
    offendedPlayerId,
  };

  if (action === "steal") {
    const risk = estimateStealFoulRisk({
      ...steal,
      distance: steal.distance,
      alignment: steal.alignment,
      fromBehind,
      handContact,
      bodyContact,
      ballFirst,
    });
    return risk >= 0.5
      ? foulRecord(FOUL_TYPES.REACH_IN, risk, detail)
      : foulRecord(FOUL_TYPES.NONE, risk, { ...detail, cleanPlay: ballFirst || risk < 0.3 });
  }

  if (action === "block" || action === "contest") {
    if (ballFirst && defenderVertical && severity < 0.72) {
      return foulRecord(FOUL_TYPES.NONE, 0.08 + severity * 0.22, { ...detail, cleanPlay: true });
    }
    const shootingRisk = clamp(
      severity * 0.68
        + (shooterAirborne ? 0.18 : 0)
        + (shotReleased ? 0.08 : 0)
        + (fromBehind ? 0.12 : 0)
        - (defenderVertical ? 0.27 : 0)
        - (ballFirst ? 0.28 : 0),
    );
    if (shootingRisk >= 0.48 && (shooterAirborne || shotReleased)) {
      return foulRecord(FOUL_TYPES.SHOOTING, shootingRisk, detail);
    }
    if (shootingRisk >= 0.55) return foulRecord(FOUL_TYPES.BLOCKING, shootingRisk, detail);
    return foulRecord(FOUL_TYPES.NONE, shootingRisk, detail);
  }

  if (action === "drive" || action === "screen") {
    const chargeRisk = clamp(
      severity * 0.68
        + (defenderEstablished ? 0.28 : -0.16)
        + (attackerInitiated ? 0.18 : -0.08),
    );
    if (chargeRisk >= 0.58 && defenderEstablished && attackerInitiated) {
      return foulRecord(FOUL_TYPES.CHARGING, chargeRisk, detail);
    }
    const blockRisk = clamp(severity * 0.74 + (defenderEstablished ? -0.2 : 0.22));
    if (blockRisk >= 0.5) return foulRecord(FOUL_TYPES.BLOCKING, blockRisk, detail);
    return foulRecord(FOUL_TYPES.NONE, Math.max(chargeRisk, blockRisk) * 0.72, detail);
  }

  if (action === "rebound") {
    const pushRisk = clamp(severity * 0.78 + (fromBehind ? 0.16 : 0));
    return pushRisk >= 0.53
      ? foulRecord(displacement > 0.65 ? FOUL_TYPES.PUSH : FOUL_TYPES.LOOSE_BALL, pushRisk, detail)
      : foulRecord(FOUL_TYPES.NONE, pushRisk, detail);
  }

  if (action === "off_ball") {
    const holdRisk = clamp(severity * 0.55 + clamp(finite(holdingSeconds) / 1.1) * 0.5);
    return holdRisk >= 0.5
      ? foulRecord(FOUL_TYPES.HOLDING, holdRisk, detail)
      : foulRecord(FOUL_TYPES.NONE, holdRisk, detail);
  }

  const incidentalRisk = clamp(severity * 0.62);
  return incidentalRisk >= 0.64
    ? foulRecord(FOUL_TYPES.PUSH, incidentalRisk, detail)
    : foulRecord(FOUL_TYPES.NONE, incidentalRisk, detail);
}

/**
 * Maps a classified foul to free throws and possession. This accommodates the
 * existing 1/2-point half-court scoring: a missed outside shot earns two shots.
 */
export function resolveFoulConsequences(foul, {
  modeId = RULESET_IDS.STREET_1V1,
  teamIds = ["home", "away"],
  possessionTeamId = null,
  shotValue = 1,
  shotMade = false,
  teamFouls = 0,
  bonusThreshold = 5,
} = {}) {
  if (!foul?.isFoul) {
    return Object.freeze({
      restartType: RESTART_TYPES.RESUME,
      freeThrows: 0,
      retainPossession: true,
      awardedTeamId: possessionTeamId,
      countBasket: false,
      ignored: true,
    });
  }

  const offendedTeamId = foul.offendedTeamId ?? possessionTeamId;
  const defenseTeamId = otherTeam(offendedTeamId, teamIds);
  if (modeId === RULESET_IDS.PRACTICE) {
    return Object.freeze({
      restartType: RESTART_TYPES.RESUME,
      freeThrows: 0,
      retainPossession: true,
      awardedTeamId: offendedTeamId,
      countBasket: Boolean(shotMade),
      ignored: true,
    });
  }
  if (modeId === RULESET_IDS.THREE_POINT_CONTEST) {
    return Object.freeze({
      restartType: RESTART_TYPES.REPLAY_CONTEST_BALL,
      freeThrows: 0,
      retainPossession: true,
      awardedTeamId: offendedTeamId,
      countBasket: false,
      replayAttempt: true,
      ignored: false,
    });
  }
  if (foul.offensive) {
    return Object.freeze({
      restartType: RESTART_TYPES.CHECK,
      freeThrows: 0,
      retainPossession: false,
      awardedTeamId: defenseTeamId,
      countBasket: false,
      turnover: true,
      ignored: false,
    });
  }

  const normalizedShotValue = Math.max(1, Math.round(finite(shotValue, 1)));
  const inBonus = finite(teamFouls) + 1 >= Math.max(1, finite(bonusThreshold, 5));
  const freeThrows = foul.shooting
    ? (shotMade ? 1 : normalizedShotValue)
    : (inBonus ? 1 : 0);
  return Object.freeze({
    restartType: freeThrows > 0 ? RESTART_TYPES.FREE_THROWS : RESTART_TYPES.CHECK,
    freeThrows,
    retainPossession: true,
    awardedTeamId: offendedTeamId,
    countBasket: Boolean(foul.shooting && shotMade),
    bonus: inBonus,
    turnover: false,
    ignored: false,
  });
}

export function resolveContactFoul(input = {}) {
  const foul = classifyContact(input);
  if (!foul.isFoul) return createRulesResult(null, resolveFoulConsequences(foul, input), []);
  const consequence = resolveFoulConsequences(foul, input);
  if (consequence.ignored) return createRulesResult(null, consequence, []);
  const event = createRulesEvent("FOUL", {
    foulType: foul.type,
    severity: foul.severity,
    risk: foul.risk,
    shooting: foul.shooting,
    offensive: foul.offensive,
    committingTeamId: foul.committingTeamId,
    committingPlayerId: foul.committingPlayerId,
    offendedTeamId: foul.offendedTeamId,
    offendedPlayerId: foul.offendedPlayerId,
    freeThrows: consequence.freeThrows,
    restartType: consequence.restartType,
    countBasket: consequence.countBasket,
    awardedTeamId: consequence.awardedTeamId,
  }, { possessionId: input.possessionId, sequence: input.sequence });

  const commands = [{ type: "WHISTLE", reason: foul.type, severity: foul.severity }];
  if (consequence.restartType === RESTART_TYPES.FREE_THROWS) {
    commands.push({
      type: "START_FREE_THROWS",
      teamId: consequence.awardedTeamId,
      shooterId: foul.offendedPlayerId,
      attempts: consequence.freeThrows,
      countBasket: consequence.countBasket,
    });
  } else if (consequence.restartType === RESTART_TYPES.CHECK) {
    commands.push({
      type: "BEGIN_CHECK",
      offenseTeamId: consequence.awardedTeamId,
      reason: foul.type,
    });
  } else if (consequence.restartType === RESTART_TYPES.REPLAY_CONTEST_BALL) {
    commands.push({ type: "REPLAY_CONTEST_BALL", countAttempt: false });
  }
  return createRulesResult(event, consequence, commands);
}

/**
 * Scores box-out leverage using inside position, body proximity, strength, and
 * whether the player's facing keeps the opponent behind them.
 */
export function evaluateBoxOut({
  rebounder,
  opponent,
  rim = { x: 0, z: -5.7 },
  maxContactDistance = 1.45,
} = {}) {
  if (!rebounder || !opponent) {
    return Object.freeze({ active: false, leverage: 0, insidePosition: 0, alignment: 0 });
  }
  const rebounderPosition = pointOf(rebounder.position);
  const opponentPosition = pointOf(opponent.position);
  const separation = distance(rebounderPosition, opponentPosition);
  const insideAdvantage = clamp(
    (distance(opponentPosition, rim) - distance(rebounderPosition, rim) + 1) / 2,
  );
  const towardOpponent = normalize({
    x: opponentPosition.x - rebounderPosition.x,
    z: opponentPosition.z - rebounderPosition.z,
  });
  const back = normalize({
    x: -finite(rebounder.facing?.x),
    z: -finite(rebounder.facing?.z, 1),
  });
  const alignment = clamp((dot(back, towardOpponent) + 1) / 2);
  const proximity = 1 - clamp(separation / Math.max(0.25, finite(maxContactDistance, 1.45)));
  const strengthEdge = clamp(
    (clamp(finite(rebounder.strength, 0.65)) - clamp(finite(opponent.strength, 0.65)) + 1) / 2,
  );
  const leverage = clamp(
    insideAdvantage * 0.4 + alignment * 0.2 + proximity * 0.25 + strengthEdge * 0.15,
  );
  return Object.freeze({
    active: proximity > 0.05 && leverage >= 0.48,
    leverage,
    insidePosition: insideAdvantage,
    alignment,
    proximity,
    separation,
  });
}

export function predictReboundLanding(ball = {}, {
  seconds = 0.42,
  gravity = 9.81,
  floorY = 0.12,
} = {}) {
  const time = clamp(finite(seconds, 0.42), 0.05, 1.2);
  const position = {
    x: finite(ball.position?.x),
    y: finite(ball.position?.y, floorY),
    z: finite(ball.position?.z),
  };
  const velocity = {
    x: finite(ball.velocity?.x),
    y: finite(ball.velocity?.y),
    z: finite(ball.velocity?.z),
  };
  return Object.freeze({
    x: position.x + velocity.x * time,
    y: Math.max(floorY, position.y + velocity.y * time - 0.5 * gravity * time * time),
    z: position.z + velocity.z * time,
    seconds: time,
  });
}

export function scoreReboundCandidate(candidate, {
  landingPoint = { x: 0, z: -5.2 },
  rim = { x: 0, z: -5.7 },
  offenseTeamId = null,
  boxOuts = {},
  maxPursuitDistance = 5.5,
  predictedLandingSeconds = 0.42,
} = {}) {
  const position = pointOf(candidate?.position);
  const velocity = pointOf(candidate?.velocity);
  const toLanding = {
    x: finite(landingPoint.x) - position.x,
    z: finite(landingPoint.z) - position.z,
  };
  const landingDistance = Math.hypot(toLanding.x, toLanding.z);
  const landingDirection = normalize(toLanding);
  const velocityTowardMps = dot(velocity, landingDirection);
  const velocityToward = clamp((velocityTowardMps + 4) / 8);
  const speedToward = Math.max(0.35, velocityTowardMps);
  const arrivalSeconds = landingDistance / speedToward;
  const arrivalTiming = 1 - clamp(
    Math.abs(arrivalSeconds - finite(predictedLandingSeconds, 0.42)) / 1.2,
  );
  const arrivalDistance = 1 - clamp(landingDistance / Math.max(1, finite(maxPursuitDistance, 5.5)));
  const arrival = arrivalDistance * 0.68 + arrivalTiming * 0.32;
  const insidePosition = 1 - clamp(distance(position, rim) / 7);
  const offensive = candidate?.teamId === offenseTeamId;
  const ratingKey = offensive ? "offensiveRebound" : "defensiveRebound";
  const rebounding = gameplayRating(
    candidate?.[ratingKey],
    candidate?.ratings?.[ratingKey] ?? candidate?.rebounding ?? candidate?.ratings?.rebounding ?? 0.65,
  );
  const vertical = gameplayRating(candidate?.vertical, candidate?.ratings?.vertical ?? 0.65);
  const height = Math.max(1.55, finite(candidate?.height, 1.9));
  const reach = gameplayRating(candidate?.reach, clamp((height - 1.5) / 0.72, 0.45, 1));
  const strength = gameplayRating(candidate?.strength, candidate?.ratings?.strength ?? 0.65);
  const groundedReadiness = candidate?.grounded === false ? 0.45 : 1;
  const explicitBoxOut = boxOuts[candidate?.id] || {};
  const boxOutLeverage = clamp(finite(
    explicitBoxOut.leverage,
    candidate?.boxOutLeverage ?? (candidate?.isBoxingOut ? 0.68 : 0),
  ));
  const boxedOutPenalty = clamp(finite(
    explicitBoxOut.boxedOutByLeverage,
    candidate?.boxedOutByLeverage ?? (candidate?.isBoxedOut ? 0.68 : 0),
  ));
  const roleBonus = candidate?.role === "big" ? 2.8 : candidate?.role === "wing" ? 0.9 : 0;
  const defensivePositionBonus = candidate?.teamId !== offenseTeamId ? 2.4 : 0;
  const score =
    arrival * 34
    + rebounding * 24
    + vertical * 8
    + reach * 8
    + strength * 6
    + velocityToward * 6
    + insidePosition * 8
    + boxOutLeverage * 16
    - boxedOutPenalty * 24
    + roleBonus
    + defensivePositionBonus
    + groundedReadiness * 2;
  return Object.freeze({
    playerId: candidate?.id ?? null,
    teamId: candidate?.teamId ?? null,
    score,
    eligible: landingDistance <= maxPursuitDistance * 1.35 && candidate?.disabled !== true,
    breakdown: Object.freeze({
      landingDistance,
      arrival,
      arrivalSeconds,
      arrivalTiming,
      rebounding,
      ratingKey,
      vertical,
      reach,
      height,
      strength,
      velocityToward,
      insidePosition,
      boxOutLeverage,
      boxedOutPenalty,
      roleBonus,
      defensivePositionBonus,
    }),
  });
}

/**
 * Returns stable ranking plus a normalized share. Ties are resolved by player
 * id so identical simulation snapshots produce identical winners.
 */
export function rankReboundCandidates(candidates = [], context = {}) {
  const computedBoxOuts = {};
  for (const candidate of candidates) {
    const opponents = candidates
      .filter((opponent) => opponent?.teamId !== candidate?.teamId)
      .sort((a, b) => distance(candidate?.position, a?.position) - distance(candidate?.position, b?.position)
        || String(a?.id).localeCompare(String(b?.id)));
    const opponent = opponents[0];
    if (!opponent) continue;
    const leverage = evaluateBoxOut({ rebounder: candidate, opponent, rim: context.rim });
    const reverse = evaluateBoxOut({ rebounder: opponent, opponent: candidate, rim: context.rim });
    computedBoxOuts[candidate?.id] = {
      leverage: leverage.active ? leverage.leverage : 0,
      boxedOutByLeverage: reverse.active ? reverse.leverage : 0,
      opponentId: opponent?.id ?? null,
    };
  }
  const boxOuts = Object.fromEntries(candidates.map((candidate) => [
    candidate?.id,
    {
      ...computedBoxOuts[candidate?.id],
      ...context.boxOuts?.[candidate?.id],
    },
  ]));
  const ranked = candidates
    .map((candidate) => scoreReboundCandidate(candidate, { ...context, boxOuts }))
    .filter((entry) => entry.eligible)
    .sort((a, b) => b.score - a.score || String(a.playerId).localeCompare(String(b.playerId)));
  if (!ranked.length) return Object.freeze([]);
  const best = ranked[0].score;
  const weights = ranked.map((entry) => Math.exp((entry.score - best) / 10));
  const weightTotal = weights.reduce((total, weight) => total + weight, 0);
  return Object.freeze(ranked.map((entry, index) => Object.freeze({
    ...entry,
    share: weights[index] / weightTotal,
    rank: index + 1,
  })));
}
