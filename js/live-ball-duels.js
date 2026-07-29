import { estimateStealFoulRisk } from "./contact-rules.js";

/**
 * Pure live-ball steal, ankle-break, deflection, and pickup-race mechanics.
 *
 * No outcome changes possession directly. Runtime integration must first put
 * the ball into its loose state and allow the normal pickup/rebound loop to win.
 */

export const LIVE_BALL_DUELS_VERSION = "1.0.0";

export const STEAL_OUTCOMES = Object.freeze({
  LOOSE_BALL: "loose_ball",
  ANKLE_BREAK: "ankle_break",
  FOUL: "foul",
  MISSED_REACH: "missed_reach",
  NO_TARGET: "no_target",
});

export const DRIBBLE_LEVERAGE = Object.freeze({
  crossover: Object.freeze({ leverage: 0.68, sweetSpot: 0.52, window: 0.24 }),
  behindBack: Object.freeze({ leverage: 0.76, sweetSpot: 0.48, window: 0.22 }),
  hesi: Object.freeze({ leverage: 0.58, sweetSpot: 0.58, window: 0.28 }),
  betweenLegs: Object.freeze({ leverage: 0.7, sweetSpot: 0.5, window: 0.24 }),
  inOut: Object.freeze({ leverage: 0.64, sweetSpot: 0.55, window: 0.26 }),
  doubleCross: Object.freeze({ leverage: 0.84, sweetSpot: 0.62, window: 0.24 }),
  spin: Object.freeze({ leverage: 0.8, sweetSpot: 0.54, window: 0.22 }),
  snatchBack: Object.freeze({ leverage: 0.88, sweetSpot: 0.58, window: 0.2 }),
  shamgod: Object.freeze({ leverage: 0.92, sweetSpot: 0.6, window: 0.2 }),
});

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const pointOf = (point) => ({
  x: finite(point?.x),
  y: finite(point?.y),
  z: finite(point?.z),
});
const distance2 = (a, b) => Math.hypot(
  finite(a?.x) - finite(b?.x),
  finite(a?.z) - finite(b?.z),
);
const length2 = (value) => Math.hypot(finite(value?.x), finite(value?.z));
const normalize2 = (value) => {
  const length = length2(value);
  return length > 1e-6
    ? { x: finite(value?.x) / length, z: finite(value?.z) / length }
    : { x: 1, z: 0 };
};
const dot2 = (a, b) => finite(a?.x) * finite(b?.x) + finite(a?.z) * finite(b?.z);
const smoothstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const rating = (value, fallback = 0.68) => {
  const resolved = finite(value, fallback);
  return clamp(resolved > 1 ? resolved / 100 : resolved);
};

function freezeCommands(commands) {
  return Object.freeze(commands.map((command) => Object.freeze({ ...command })));
}

export function getDribbleMoveLeverage(move, progress = 0.5) {
  const config = DRIBBLE_LEVERAGE[move];
  if (!config) return Object.freeze({
    move: move ?? null,
    active: false,
    timing: 0,
    leverage: 0,
  });
  const timing = 1 - smoothstep(
    config.window * 0.35,
    config.window,
    Math.abs(clamp(finite(progress, 0.5)) - config.sweetSpot),
  );
  return Object.freeze({
    move,
    active: true,
    timing,
    leverage: config.leverage * timing,
    sweetSpot: config.sweetSpot,
  });
}

export function calculateAnkleBreakRisk({
  dribbleMove,
  dribbleProgress = 0.5,
  handlerRating = 0.75,
  handlerSpeed = 0.7,
  moveExecution = 0.75,
  defenderBalance = 0.7,
  defenderDiscipline = 0.68,
  defenderMomentum = 0.5,
  reachAggression = 0.6,
  defenderWrongFoot = false,
} = {}) {
  const move = getDribbleMoveLeverage(dribbleMove, dribbleProgress);
  if (!move.active) return Object.freeze({
    risk: 0,
    stunSeconds: 0,
    move,
    label: "none",
  });
  const ratingEdge = clamp((clamp(finite(handlerRating, 0.75))
    - clamp(finite(defenderBalance, 0.7)) + 1) / 2);
  const wrongFoot = defenderWrongFoot ? 1 : clamp(finite(defenderMomentum, 0.5));
  const risk = clamp(
    move.leverage * 0.42
      + move.timing * 0.16
      + ratingEdge * 0.13
      + clamp(finite(moveExecution, 0.75)) * 0.11
      + clamp(finite(handlerSpeed, 0.7)) * 0.07
      + wrongFoot * 0.11
      + clamp(finite(reachAggression, 0.6)) * 0.09
      - clamp(finite(defenderDiscipline, 0.68)) * 0.08,
  );
  const stunSeconds = risk <= 0.25
    ? 0
    : clamp(0.22 + risk * 1.28, 0, 1.5);
  return Object.freeze({
    risk,
    stunSeconds,
    move,
    label: risk >= 0.82 ? "broken_down" : risk >= 0.55 ? "off_balance" : "stayed_home",
  });
}

export function calculatePokeProbability({
  distance = 1,
  alignment = 0.5,
  reachTiming = 0.6,
  ballExposure = 0.5,
  defenderStealRating = 0.7,
  defenderReach = 0.65,
  handlerBallSecurity = 0.72,
  dribbleMove,
  dribbleProgress = 0.5,
} = {}) {
  const move = getDribbleMoveLeverage(dribbleMove, dribbleProgress);
  const distanceFactor = 1 - smoothstep(0.5, 1.75, Math.max(0, finite(distance, 1)));
  const angleFactor = clamp((finite(alignment, 0.5) + 1) / 2);
  const probability = clamp(
    0.08
      + distanceFactor * 0.25
      + angleFactor * 0.1
      + clamp(finite(reachTiming, 0.6)) * 0.15
      + clamp(finite(ballExposure, 0.5)) * 0.18
      + clamp(finite(defenderStealRating, 0.7)) * 0.18
      + clamp(finite(defenderReach, 0.65)) * 0.07
      - clamp(finite(handlerBallSecurity, 0.72)) * 0.2
      - move.leverage * 0.16,
  );
  return Object.freeze({
    probability,
    moveProtection: move.leverage,
    distanceFactor,
    angleFactor,
  });
}

/**
 * Explainable steal matchup bands shared by user and CPU attempts. Ratings may
 * be supplied on either a 0..1 gameplay scale or a 25..99 profile scale.
 */
export function calculateStealMatchupBands({
  steal = 0.7,
  perimeterDefense = 0.7,
  reaction = 0.7,
  ballHandle = 0.7,
  ballSecurity = 0.7,
  handlerStrength = 0.65,
  distance = 1,
  alignment = 0.5,
  reachTiming = 0.6,
  ballExposure = 0.5,
  fromBehind = false,
  handContact = 0,
  bodyContact = 0,
  ballFirst = false,
} = {}) {
  const defenderComposite = rating(steal) * 0.52
    + rating(perimeterDefense) * 0.28
    + rating(reaction) * 0.2;
  const handlerComposite = rating(ballHandle) * 0.42
    + rating(ballSecurity) * 0.4
    + rating(handlerStrength) * 0.18;
  const matchupEdge = defenderComposite - handlerComposite;
  const distanceFactor = 1 - smoothstep(0.5, 1.75, Math.max(0, finite(distance, 1)));
  const angleFactor = clamp((finite(alignment, 0.5) + 1) / 2);
  const timing = clamp(finite(reachTiming, 0.6));
  const exposure = clamp(finite(ballExposure, 0.5));
  const cleanProbability = clamp(
    0.1
      + matchupEdge * 0.48
      + distanceFactor * 0.16
      + angleFactor * 0.08
      + timing * 0.12
      + exposure * 0.12
      + (ballFirst ? 0.08 : 0),
    0.035,
    0.78,
  );
  let foulProbability = clamp(
    0.14
      - matchupEdge * 0.12
      + (fromBehind ? 0.18 : 0)
      + clamp(finite(handContact)) * 0.12
      + clamp(finite(bodyContact)) * 0.18
      + (1 - timing) * 0.08
      - (ballFirst ? 0.1 : 0),
    0.025,
    0.58,
  );
  let clean = cleanProbability;
  if (clean + foulProbability > 0.92) {
    const scale = 0.92 / (clean + foulProbability);
    clean *= scale;
    foulProbability *= scale;
  }
  return Object.freeze({
    cleanProbability: clean,
    foulProbability,
    whiffProbability: 1 - clean - foulProbability,
    defenderComposite,
    handlerComposite,
    matchupEdge,
    breakdown: Object.freeze({
      distanceFactor,
      angleFactor,
      timing,
      exposure,
    }),
  });
}

/**
 * Produces a roll/bounce vector away from both bodies. Last touch deliberately
 * remains the former owner so out-of-bounds adjudication can use that contract.
 */
export function calculateLooseBallDeflection({
  ballPosition = { x: 0, y: 0.8, z: 0 },
  ownerPosition = { x: 0, y: 0, z: 0 },
  defenderPosition = { x: 1, y: 0, z: 0 },
  ownerVelocity = { x: 0, y: 0, z: 0 },
  pokeSide = 1,
  pokeStrength = 0.65,
  ownerId = null,
  ownerTeamId = null,
} = {}) {
  const owner = pointOf(ownerPosition);
  const defender = pointOf(defenderPosition);
  const away = normalize2({
    x: owner.x - defender.x,
    z: owner.z - defender.z,
  });
  const lateral = { x: -away.z, z: away.x };
  const strength = clamp(finite(pokeStrength, 0.65));
  const side = finite(pokeSide, 1) < 0 ? -1 : 1;
  const speed = 2.2 + strength * 3.6;
  const velocity = Object.freeze({
    x: away.x * speed * 0.62
      + lateral.x * side * speed * 0.58
      + finite(ownerVelocity.x) * 0.22,
    y: 0.18 + strength * 0.42,
    z: away.z * speed * 0.62
      + lateral.z * side * speed * 0.58
      + finite(ownerVelocity.z) * 0.22,
  });
  return Object.freeze({
    position: Object.freeze(pointOf(ballPosition)),
    velocity,
    angularVelocity: Object.freeze({
      x: side * (4 + strength * 5),
      y: strength * 3,
      z: -side * (5 + strength * 4),
    }),
    state: "loose",
    pickupDelay: 0.1 + strength * 0.08,
    automaticPossession: false,
    lastTouchPlayerId: ownerId,
    lastTouchTeamId: ownerTeamId,
    previousOwnerId: ownerId,
    previousOwnerTeamId: ownerTeamId,
  });
}

export function resolveLiveBallSteal({
  owner,
  defender,
  ball,
  distance,
  alignment = 0.5,
  reachTiming = 0.6,
  ballExposure = 0.5,
  handContact = 0,
  bodyContact = 0,
  fromBehind = false,
  ballFirst = false,
  victimProtectingBall = false,
  dribbleMove,
  dribbleProgress = 0.5,
  moveExecution = 0.75,
  defenderWrongFoot = false,
  foulCheckValue = 0.5,
  ankleCheckValue = 0.5,
  pokeCheckValue = 0.5,
  pokeSide = 1,
} = {}) {
  if (!owner || !defender || owner.teamId === defender.teamId) {
    return Object.freeze({
      outcome: STEAL_OUTCOMES.NO_TARGET,
      event: null,
      commands: Object.freeze([]),
      automaticPossession: false,
    });
  }
  const resolvedDistance = distance == null
    ? distance2(owner.position, defender.position)
    : Math.max(0, finite(distance));
  const stealBands = calculateStealMatchupBands({
    steal: defender.stealRating ?? defender.ratings?.steal ?? 0.7,
    perimeterDefense: defender.perimeterDefense ?? defender.ratings?.perimeterDefense ?? 0.68,
    reaction: defender.reaction ?? defender.ratings?.reaction ?? 0.68,
    ballHandle: owner.handleRating ?? owner.ratings?.ballHandle ?? owner.ratings?.handle ?? 0.72,
    ballSecurity: owner.ballSecurity ?? owner.ratings?.ballSecurity ?? 0.72,
    handlerStrength: owner.strength ?? owner.ratings?.strength ?? 0.65,
    distance: resolvedDistance,
    alignment,
    reachTiming,
    ballExposure,
    fromBehind,
    handContact,
    bodyContact,
    ballFirst,
  });
  const foulRisk = estimateStealFoulRisk({
    distance: resolvedDistance,
    alignment,
    fromBehind,
    handContact,
    bodyContact,
    timing: reachTiming,
    ballExposed: ballExposure,
    ballFirst,
    defenderRating: stealBands.defenderComposite,
    fatigue: 1 - clamp(finite(defender.stamina, 1)),
    victimProtectingBall,
  });
  const ankle = calculateAnkleBreakRisk({
    dribbleMove,
    dribbleProgress,
    handlerRating: owner.handleRating ?? owner.ratings?.handle ?? 0.75,
    handlerSpeed: clamp(length2(owner.velocity) / 6),
    moveExecution,
    defenderBalance: defender.balance ?? defender.ratings?.balance ?? 0.7,
    defenderDiscipline: defender.discipline ?? defender.ratings?.discipline ?? 0.68,
    defenderMomentum: clamp(length2(defender.velocity) / 5),
    reachAggression: defender.reachAggression ?? 0.6,
    defenderWrongFoot,
  });
  const poke = calculatePokeProbability({
    distance: resolvedDistance,
    alignment,
    reachTiming,
    ballExposure,
    defenderStealRating: stealBands.defenderComposite,
    defenderReach: defender.reach ?? 0.65,
    handlerBallSecurity: stealBands.handlerComposite,
    dribbleMove,
    dribbleProgress,
  });
  const foul = clamp(finite(foulCheckValue, 0.5)) < stealBands.foulProbability;
  const ankleBroken = !foul
    && ankle.move.active
    && clamp(finite(ankleCheckValue, 0.5)) < ankle.risk;
  const poked = !foul
    && !ankleBroken
    && clamp(finite(pokeCheckValue, 0.5))
      < stealBands.cleanProbability / Math.max(0.001, 1 - stealBands.foulProbability);

  if (foul) {
    const event = Object.freeze({
      type: "FOUL",
      foulType: "reach_in",
      committingPlayerId: defender.id,
      committingTeamId: defender.teamId,
      offendedPlayerId: owner.id,
      offendedTeamId: owner.teamId,
      risk: foulRisk,
    });
    return Object.freeze({
      outcome: STEAL_OUTCOMES.FOUL,
      event,
      foulRisk,
      stealBands,
      ankleRisk: ankle.risk,
      pokeProbability: poke.probability,
      commands: freezeCommands([{ type: "WHISTLE", reason: "reach_in" }]),
      automaticPossession: false,
    });
  }

  if (ankleBroken) {
    const event = Object.freeze({
      type: "ANKLE_BREAK",
      handlerPlayerId: owner.id,
      defenderPlayerId: defender.id,
      move: dribbleMove,
      risk: ankle.risk,
      stunSeconds: ankle.stunSeconds,
    });
    return Object.freeze({
      outcome: STEAL_OUTCOMES.ANKLE_BREAK,
      event,
      foulRisk,
      stealBands,
      ankleRisk: ankle.risk,
      pokeProbability: poke.probability,
      stunSeconds: ankle.stunSeconds,
      commands: freezeCommands([{
        type: "STUN_DEFENDER",
        playerId: defender.id,
        seconds: ankle.stunSeconds,
        reason: "ankle_break",
      }]),
      automaticPossession: false,
    });
  }

  if (poked) {
    const looseBall = calculateLooseBallDeflection({
      ballPosition: ball?.position,
      ownerPosition: owner.position,
      defenderPosition: defender.position,
      ownerVelocity: owner.velocity,
      pokeSide,
      pokeStrength: clamp(
        poke.probability * 0.62
          + (defender.stealRating ?? defender.ratings?.steal ?? 0.7) * 0.38,
      ),
      ownerId: owner.id,
      ownerTeamId: owner.teamId,
    });
    const event = Object.freeze({
      type: "BALL_POKED_LOOSE",
      defenderPlayerId: defender.id,
      defenderTeamId: defender.teamId,
      previousOwnerId: owner.id,
      previousOwnerTeamId: owner.teamId,
      lastTouchPlayerId: owner.id,
      lastTouchTeamId: owner.teamId,
      velocity: looseBall.velocity,
      automaticPossession: false,
    });
    return Object.freeze({
      outcome: STEAL_OUTCOMES.LOOSE_BALL,
      event,
      looseBall,
      foulRisk,
      stealBands,
      ankleRisk: ankle.risk,
      pokeProbability: poke.probability,
      commands: freezeCommands([{
        type: "RELEASE_BALL_LOOSE",
        ownerId: owner.id,
        position: looseBall.position,
        velocity: looseBall.velocity,
        angularVelocity: looseBall.angularVelocity,
        pickupDelay: looseBall.pickupDelay,
        lastTouchPlayerId: owner.id,
        lastTouchTeamId: owner.teamId,
        automaticPossession: false,
      }]),
      automaticPossession: false,
    });
  }

  return Object.freeze({
    outcome: STEAL_OUTCOMES.MISSED_REACH,
    event: Object.freeze({
      type: "STEAL_REACH_MISSED",
      defenderPlayerId: defender.id,
      ownerPlayerId: owner.id,
      foulRisk,
      pokeProbability: poke.probability,
    }),
    foulRisk,
    stealBands,
    ankleRisk: ankle.risk,
    pokeProbability: poke.probability,
    commands: Object.freeze([]),
    automaticPossession: false,
  });
}

export function predictLooseBallRoll(ball, seconds, friction = 2.8) {
  const position = pointOf(ball?.position);
  const velocity = pointOf(ball?.velocity);
  const time = Math.max(0, finite(seconds));
  const decay = Math.max(0.01, finite(friction, 2.8));
  const multiplier = (1 - Math.exp(-decay * time)) / decay;
  const velocityScale = Math.exp(-decay * time);
  return Object.freeze({
    position: Object.freeze({
      x: position.x + velocity.x * multiplier,
      y: Math.max(0.12, position.y + velocity.y * time - 4.905 * time * time),
      z: position.z + velocity.z * multiplier,
    }),
    velocity: Object.freeze({
      x: velocity.x * velocityScale,
      y: velocity.y - 9.81 * time,
      z: velocity.z * velocityScale,
    }),
  });
}

export function scorePickupCandidate(candidate, {
  ball,
  predictionSeconds = 0.28,
  reactionFloor = 0.08,
} = {}) {
  const predicted = predictLooseBallRoll(ball, predictionSeconds);
  const distance = distance2(candidate?.position, predicted.position);
  const speed = Math.max(1.4, finite(candidate?.speed, 4.1));
  const reaction = Math.max(
    finite(reactionFloor, 0.08),
    finite(candidate?.reactionSeconds, 0.2),
  );
  const stunned = Math.max(0, finite(candidate?.stunSeconds));
  const velocity = pointOf(candidate?.velocity);
  const toBall = normalize2({
    x: predicted.position.x - finite(candidate?.position?.x),
    z: predicted.position.z - finite(candidate?.position?.z),
  });
  const momentumHelp = clamp((dot2(normalize2(velocity), toBall) + 1) / 2);
  const hustle = clamp(finite(candidate?.hustle, candidate?.ratings?.hustle ?? 0.7));
  const looseBallRating = clamp(finite(
    candidate?.looseBall,
    candidate?.ratings?.looseBall ?? 0.68,
  ));
  const eta = reaction + stunned + distance / speed * (1.12 - momentumHelp * 0.22);
  const score = 1 / Math.max(0.05, eta)
    + hustle * 0.72
    + looseBallRating * 0.68
    + momentumHelp * 0.24;
  return Object.freeze({
    playerId: candidate?.id ?? null,
    teamId: candidate?.teamId ?? null,
    score,
    eta,
    distance,
    stunned,
    predictedBallPosition: predicted.position,
    eligible: candidate?.disabled !== true && stunned < 1.5,
  });
}

export function rankPickupRace(candidates = [], context = {}) {
  const ranked = candidates
    .map((candidate) => scorePickupCandidate(candidate, context))
    .filter((entry) => entry.eligible)
    .sort((a, b) => a.eta - b.eta || b.score - a.score
      || String(a.playerId).localeCompare(String(b.playerId)));
  if (!ranked.length) return Object.freeze([]);
  const weights = ranked.map((entry) => Math.exp(-entry.eta * 3.2));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return Object.freeze(ranked.map((entry, index) => Object.freeze({
    ...entry,
    rank: index + 1,
    share: weights[index] / total,
  })));
}

/**
 * Reports a pickup candidate without assigning possession. The runtime must
 * still verify live distance/height and call its ordinary possession method.
 */
export function resolvePickupOpportunity(candidates = [], {
  ball,
  pickupRadius = 0.78,
  maxBallHeight = 1.35,
  ...context
} = {}) {
  const ranked = rankPickupRace(candidates, { ball, ...context });
  const leader = ranked[0] || null;
  const ready = Boolean(
    leader
      && leader.distance <= Math.max(0.1, finite(pickupRadius, 0.78))
      && finite(ball?.position?.y, 0.12) <= Math.max(0.2, finite(maxBallHeight, 1.35)),
  );
  return Object.freeze({
    ready,
    candidatePlayerId: ready ? leader.playerId : null,
    candidateTeamId: ready ? leader.teamId : null,
    ranked,
    automaticPossession: false,
    commands: Object.freeze([]),
    event: ready
      ? Object.freeze({
        type: "LOOSE_BALL_PICKUP_AVAILABLE",
        playerId: leader.playerId,
        teamId: leader.teamId,
        automaticPossession: false,
      })
      : null,
  });
}
