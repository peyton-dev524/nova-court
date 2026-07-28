/**
 * Original procedural power-finish choreography for NOVA COURT.
 *
 * This module contains no branded/player-specific animation data. It converts
 * approach geometry and ratings into normalized, deterministic choreography
 * samples that can drive the existing procedural athlete rig or an AI preview.
 */

export const DUNK_CHOREOGRAPHY_VERSION = "1.0.0";

export const DUNK_TYPES = Object.freeze({
  POWER_ONE_HAND: "power_one_hand",
  POWER_TWO_HAND: "power_two_hand",
  REVERSE: "reverse",
  TOMAHAWK: "tomahawk",
});

export const DUNK_OUTCOMES = Object.freeze({
  MADE: "made",
  BLOCKED: "blocked",
  MISSED: "missed",
});

export const DUNK_PHASES = Object.freeze({
  APPROACH: "approach",
  GATHER: "gather",
  TAKEOFF: "takeoff",
  COCK: "cock",
  FINISH: "finish",
  HANG: "hang",
  RELEASE: "release",
  LAND: "land",
});

const STYLE_ORDER = Object.freeze([
  DUNK_TYPES.POWER_ONE_HAND,
  DUNK_TYPES.POWER_TWO_HAND,
  DUNK_TYPES.REVERSE,
  DUNK_TYPES.TOMAHAWK,
]);

export const DUNK_STYLE_CONFIG = Object.freeze({
  [DUNK_TYPES.POWER_ONE_HAND]: Object.freeze({
    duration: 0.82,
    difficulty: 0.26,
    baseMake: 0.9,
    contestResistance: 0.54,
    requiredStamina: 0.28,
    idealDistance: 1.15,
    idealSpeed: 4.3,
    maxHangSeconds: 0.25,
    gripHands: 1,
    milestones: Object.freeze({
      gather: 0.1, takeoff: 0.23, cock: 0.39, rim: 0.61,
      release: 0.69, hangEnd: 0.79, land: 1,
    }),
  }),
  [DUNK_TYPES.POWER_TWO_HAND]: Object.freeze({
    duration: 0.88,
    difficulty: 0.2,
    baseMake: 0.94,
    contestResistance: 0.7,
    requiredStamina: 0.34,
    idealDistance: 0.92,
    idealSpeed: 3.6,
    maxHangSeconds: 0.34,
    gripHands: 2,
    milestones: Object.freeze({
      gather: 0.11, takeoff: 0.25, cock: 0.4, rim: 0.63,
      release: 0.72, hangEnd: 0.84, land: 1,
    }),
  }),
  [DUNK_TYPES.REVERSE]: Object.freeze({
    duration: 0.94,
    difficulty: 0.42,
    baseMake: 0.82,
    contestResistance: 0.66,
    requiredStamina: 0.42,
    idealDistance: 1.08,
    idealSpeed: 3.9,
    maxHangSeconds: 0.28,
    gripHands: 1,
    milestones: Object.freeze({
      gather: 0.1, takeoff: 0.23, cock: 0.42, rim: 0.65,
      release: 0.73, hangEnd: 0.82, land: 1,
    }),
  }),
  [DUNK_TYPES.TOMAHAWK]: Object.freeze({
    duration: 0.91,
    difficulty: 0.48,
    baseMake: 0.8,
    contestResistance: 0.43,
    requiredStamina: 0.56,
    idealDistance: 1.28,
    idealSpeed: 5,
    maxHangSeconds: 0.22,
    gripHands: 1,
    milestones: Object.freeze({
      gather: 0.09, takeoff: 0.22, cock: 0.44, rim: 0.64,
      release: 0.7, hangEnd: 0.78, land: 1,
    }),
  }),
});

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => lerp(a, b, clamp(t));
const smoothstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
};
const smootherstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const bell = (start, peak, end, value) =>
  value <= peak
    ? smoothstep(start, peak, value)
    : 1 - smoothstep(peak, end, value);
const proximity = (value, target, radius) =>
  1 - clamp(Math.abs(finite(value) - target) / Math.max(0.001, radius));
const pointOf = (point) => ({ x: finite(point?.x), z: finite(point?.z) });
const magnitude = (point) => Math.hypot(finite(point?.x), finite(point?.z));
const freezeScores = (scores) => Object.freeze(
  Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, finite(value)])),
);

function styleConfig(type) {
  return DUNK_STYLE_CONFIG[type] || DUNK_STYLE_CONFIG[DUNK_TYPES.POWER_ONE_HAND];
}

/**
 * Normalizes either authored metrics or raw position/velocity into the compact
 * context consumed by selection and outcome logic.
 */
export function normalizeDunkContext(context = {}) {
  const playerPosition = pointOf(context.playerPosition || context.position);
  const rimPosition = pointOf(context.rimPosition || context.rim || { x: 0, z: -5.7 });
  const velocity = pointOf(context.velocity);
  const toRim = {
    x: rimPosition.x - playerPosition.x,
    z: rimPosition.z - playerPosition.z,
  };
  const computedDistance = magnitude(toRim);
  const computedSpeed = magnitude(velocity);
  const approachCross = computedDistance > 1e-6 && computedSpeed > 1e-6
    ? (velocity.x * toRim.z - velocity.z * toRim.x) / (computedDistance * computedSpeed)
    : 0;
  const approachDot = computedDistance > 1e-6 && computedSpeed > 1e-6
    ? (velocity.x * toRim.x + velocity.z * toRim.z) / (computedDistance * computedSpeed)
    : 1;
  const laneAngle = clamp(
    finite(context.laneAngle, Math.asin(clamp(approachCross, -1, 1))),
    -Math.PI / 2,
    Math.PI / 2,
  );
  const distance = clamp(finite(context.distance, computedDistance), 0, 12);
  const speed = clamp(finite(context.speed, computedSpeed), 0, 12);
  const defenderContest = clamp(finite(context.defenderContest, context.contest ?? 0));
  const defenderSide = clamp(finite(context.defenderSide), -1, 1);
  const handedness = finite(context.handedness, 1) < 0 ? -1 : 1;
  return Object.freeze({
    distance,
    speed,
    laneAngle,
    laneSide: Math.abs(laneAngle) > 0.04 ? Math.sign(laneAngle) : Math.sign(playerPosition.x) || handedness,
    approachAlignment: clamp((approachDot + 1) / 2),
    stamina: clamp(finite(context.stamina, 0.75)),
    defenderContest,
    defenderSide,
    traffic: clamp(finite(context.traffic, defenderContest)),
    finishRating: clamp(finite(context.finishRating, context.dunkRating ?? 0.72)),
    vertical: clamp(finite(context.vertical, 0.7)),
    strength: clamp(finite(context.strength, 0.7)),
    ballSecurity: clamp(finite(context.ballSecurity, 0.72)),
    handedness,
    canDunk: context.canDunk !== false,
    playerPosition: Object.freeze(playerPosition),
    rimPosition: Object.freeze(rimPosition),
  });
}

/**
 * Returns explainable style scores. Higher pressure favors secure two-hand and
 * reverse protection; clear, fast center-lane approaches unlock the tomahawk.
 */
export function scoreDunkStyles(rawContext = {}) {
  const context = normalizeDunkContext(rawContext);
  const angle = Math.abs(context.laneAngle) / (Math.PI / 2);
  const baselineApproach = smoothstep(0.42, 0.88, angle);
  const centerLane = 1 - smoothstep(0.16, 0.7, angle);
  const highPressure = smoothstep(0.35, 0.88, context.defenderContest);
  const highSpeed = smoothstep(2.7, 5.8, context.speed);
  const scores = {
    [DUNK_TYPES.POWER_ONE_HAND]:
      0.36
      + proximity(context.distance, 1.15, 1.15) * 0.18
      + proximity(context.speed, 4.3, 3.2) * 0.15
      + context.finishRating * 0.12
      + centerLane * 0.08
      - highPressure * 0.08,
    [DUNK_TYPES.POWER_TWO_HAND]:
      0.24
      + proximity(context.distance, 0.92, 0.9) * 0.2
      + context.strength * 0.15
      + highPressure * 0.19
      + context.traffic * 0.11
      + context.ballSecurity * 0.08
      - baselineApproach * 0.08,
    [DUNK_TYPES.REVERSE]:
      0.14
      + baselineApproach * 0.5
      + highPressure * 0.11
      + (context.defenderSide * context.laneSide < 0 ? 0.1 : 0)
      + proximity(context.distance, 1.08, 0.9) * 0.13
      + context.finishRating * 0.08
      - (1 - context.stamina) * 0.14,
    [DUNK_TYPES.TOMAHAWK]:
      0.08
      + highSpeed * 0.27
      + centerLane * 0.16
      + context.vertical * 0.16
      + context.stamina * 0.15
      + proximity(context.distance, 1.28, 0.85) * 0.14
      - highPressure * 0.27
      - context.traffic * 0.11,
  };
  return Object.freeze({
    context,
    scores: freezeScores(scores),
    ranked: Object.freeze(STYLE_ORDER
      .map((type) => Object.freeze({ type, score: scores[type] }))
      .sort((a, b) => b.score - a.score || STYLE_ORDER.indexOf(a.type) - STYLE_ORDER.indexOf(b.type))),
  });
}

export function selectDunkChoreography(rawContext = {}) {
  const scored = scoreDunkStyles(rawContext);
  const { context } = scored;
  const winner = scored.ranked[0];
  const config = styleConfig(winner.type);
  const runway = clamp((1.85 - context.distance) / 0.85);
  const fatigueSafety = clamp(
    (context.stamina - config.requiredStamina + 0.2) / 0.55,
  );
  const physicalReadiness = context.finishRating * 0.42
    + context.vertical * 0.24
    + context.strength * 0.12
    + fatigueSafety * 0.22;
  const eligible = context.canDunk
    && context.distance >= 0.35
    && context.distance <= 1.85
    && context.speed >= 1.8
    && context.stamina >= 0.18
    && context.approachAlignment >= 0.42
    && physicalReadiness >= 0.42;
  const finishHand = winner.type === DUNK_TYPES.POWER_TWO_HAND
    ? 0
    : winner.type === DUNK_TYPES.REVERSE
      ? -context.laneSide
      : (context.laneSide || context.handedness);
  const takeoffFoot = finishHand === 0
    ? -context.handedness
    : -finishHand;
  const selectionConfidence = clamp(
    winner.score - (scored.ranked[1]?.score ?? 0) + 0.5,
  );

  return Object.freeze({
    type: winner.type,
    eligible,
    reason: eligible
      ? "finish_window_open"
      : context.distance > 1.85
        ? "too_far"
        : context.speed < 1.8
          ? "insufficient_momentum"
          : context.stamina < 0.18
            ? "low_stamina"
            : context.approachAlignment < 0.42
              ? "moving_away_from_rim"
              : "insufficient_finish_readiness",
    finishHand,
    takeoffFoot,
    duration: config.duration,
    difficulty: config.difficulty,
    selectionConfidence,
    styleScores: scored.scores,
    milestones: config.milestones,
    context,
  });
}

function phaseFor(progress, milestones) {
  if (progress < milestones.gather) return DUNK_PHASES.APPROACH;
  if (progress < milestones.takeoff) return DUNK_PHASES.GATHER;
  if (progress < milestones.cock) return DUNK_PHASES.TAKEOFF;
  if (progress < milestones.rim) return DUNK_PHASES.COCK;
  if (progress < milestones.release) return DUNK_PHASES.FINISH;
  if (progress < milestones.hangEnd) return DUNK_PHASES.HANG;
  if (progress < 0.9) return DUNK_PHASES.RELEASE;
  return DUNK_PHASES.LAND;
}

function armPose(shoulderPitch, shoulderRoll, elbow, wrist = 0) {
  return Object.freeze({ shoulderPitch, shoulderRoll, elbow, wrist });
}

function legPose(hipPitch, hipRoll, knee, ankle = 0) {
  return Object.freeze({ hipPitch, hipRoll, knee, ankle });
}

/**
 * Samples a normalized pose at progress 0..1. Values are rig-neutral radians or
 * body-height-relative offsets. Every channel is continuous at phase boundaries.
 */
export function sampleDunkChoreography(selectionOrType, rawProgress, contextOverrides = {}) {
  const directType = typeof selectionOrType === "string" ? selectionOrType : null;
  const directContext = directType ? normalizeDunkContext(contextOverrides) : null;
  const directFinishHand = directType === DUNK_TYPES.POWER_TWO_HAND
    ? 0
    : directType === DUNK_TYPES.REVERSE
      ? -directContext.laneSide
      : directContext?.laneSide || directContext?.handedness || 1;
  const selection = directType
    ? Object.freeze({
      type: directType,
      eligible: true,
      finishHand: directFinishHand,
      takeoffFoot: directFinishHand === 0 ? -directContext.handedness : -directFinishHand,
      context: directContext,
    })
    : selectionOrType || selectDunkChoreography(contextOverrides);
  const type = directType || selection.type;
  const config = styleConfig(type);
  const context = selection.context || normalizeDunkContext(contextOverrides);
  const p = clamp(finite(rawProgress));
  const m = config.milestones;
  const gather = smootherstep(m.gather * 0.35, m.takeoff, p);
  const rise = bell(m.gather, m.rim, m.hangEnd + 0.04, p);
  const cock = bell(m.takeoff, m.cock, m.rim, p);
  const strike = smootherstep(m.cock, m.rim, p);
  const hang = bell(m.rim - 0.015, m.release, m.hangEnd, p);
  const landing = smootherstep(m.hangEnd, 1, p);
  const finishHand = selection.finishHand ?? context.handedness;
  const side = finishHand || context.handedness;
  const laneTurn = clamp(context.laneAngle / (Math.PI / 2), -1, 1);

  let rootTurn = laneTurn * 0.14 * gather;
  let torsoPitch = -0.16 * gather + 0.12 * strike - 0.06 * landing;
  let torsoYaw = rootTurn * 0.6;
  let torsoRoll = -side * 0.08 * cock;
  let ballSide = side * mix(0.34, 0.18, gather);
  let ballForward = mix(0.32, 0.04, gather);
  let ballHeight = mix(0.88, 2.05, gather);
  let ballRotation = side * strike * 0.45;
  let leftShoulder = -0.25 * gather;
  let rightShoulder = -0.25 * gather;
  let leftRoll = -0.08;
  let rightRoll = 0.08;
  let leftElbow = -0.55 * gather;
  let rightElbow = -0.55 * gather;

  if (type === DUNK_TYPES.POWER_ONE_HAND) {
    ballSide = side * mix(0.38, 0.24, strike);
    ballForward = mix(0.28, -0.02, strike);
    ballHeight = 0.9 + gather * 1.08 + cock * 0.22 - hang * 0.12;
    const finishArm = mix(-0.32, -3.02, gather) + cock * 0.18;
    const guideArm = mix(-0.28, -1.25, gather) + strike * 0.42;
    leftShoulder = side < 0 ? finishArm : guideArm;
    rightShoulder = side > 0 ? finishArm : guideArm;
    leftRoll = side < 0 ? -0.2 : -0.48 * strike;
    rightRoll = side > 0 ? 0.2 : 0.48 * strike;
    leftElbow = side < 0 ? -0.08 : -0.62 + strike * 0.2;
    rightElbow = side > 0 ? -0.08 : -0.62 + strike * 0.2;
    torsoRoll = -side * (0.12 * cock + 0.05 * strike);
  } else if (type === DUNK_TYPES.POWER_TWO_HAND) {
    ballSide = 0;
    ballForward = mix(0.3, -0.03, strike);
    ballHeight = 0.9 + gather * 1.12 + cock * 0.12 - hang * 0.15;
    leftShoulder = mix(-0.28, -2.96, gather) + hang * 0.08;
    rightShoulder = leftShoulder;
    leftRoll = mix(-0.08, -0.17, gather);
    rightRoll = -leftRoll;
    leftElbow = mix(-0.62, -0.12, gather);
    rightElbow = leftElbow;
    torsoPitch -= 0.09 * strike;
  } else if (type === DUNK_TYPES.REVERSE) {
    const rotation = smootherstep(m.takeoff, m.rim, p);
    rootTurn += -context.laneSide * Math.PI * 0.82 * rotation;
    torsoYaw += -context.laneSide * 0.38 * rotation;
    torsoRoll = context.laneSide * 0.14 * cock;
    ballSide = -context.laneSide * mix(0.3, 0.16, strike);
    ballForward = mix(0.25, -0.3, strike);
    ballHeight = 0.9 + gather * 1.06 + cock * 0.18 - hang * 0.1;
    const finishArm = mix(-0.3, -2.86, gather) - strike * 0.12;
    const guideArm = mix(-0.28, -1.18, gather);
    leftShoulder = finishHand < 0 ? finishArm : guideArm;
    rightShoulder = finishHand > 0 ? finishArm : guideArm;
    leftRoll = finishHand < 0 ? -0.3 : -0.46;
    rightRoll = finishHand > 0 ? 0.3 : 0.46;
    leftElbow = finishHand < 0 ? -0.12 : -0.54;
    rightElbow = finishHand > 0 ? -0.12 : -0.54;
    ballRotation = -context.laneSide * rotation * 1.1;
  } else if (type === DUNK_TYPES.TOMAHAWK) {
    ballSide = side * mix(0.28, 0.16, strike);
    ballForward = mix(0.28, -0.46, cock) + strike * 0.5;
    ballHeight = 0.9 + gather * 1.2 + cock * 0.34 - strike * 0.12;
    const finishArm = mix(-0.28, -2.35, gather) + cock * 0.58 - strike * 0.68;
    const guideArm = mix(-0.26, -1.08, gather) + strike * 0.35;
    leftShoulder = side < 0 ? finishArm : guideArm;
    rightShoulder = side > 0 ? finishArm : guideArm;
    leftRoll = side < 0 ? -0.24 : -0.52 * cock;
    rightRoll = side > 0 ? 0.24 : 0.52 * cock;
    leftElbow = side < 0 ? -0.1 : -0.58;
    rightElbow = side > 0 ? -0.1 : -0.58;
    torsoPitch -= 0.14 * cock;
    ballRotation = side * (cock * -0.8 + strike * 1.22);
  }

  const leadLeg = selection.takeoffFoot ?? -side;
  const kneeDrive = bell(m.gather, m.cock, m.release, p);
  const landingBend = bell(0.86, 0.96, 1, p);
  const leftLead = leadLeg < 0 ? 1 : 0;
  const rightLead = leadLeg > 0 ? 1 : 0;
  const leftKnee = kneeDrive * mix(0.42, 1.04, leftLead) + landingBend * 0.72;
  const rightKnee = kneeDrive * mix(0.42, 1.04, rightLead) + landingBend * 0.72;
  const rootHeight = Math.max(0, rise * (0.84 + context.vertical * 0.34) - landingBend * 0.06);
  const forwardTravel = smootherstep(0, m.rim, p) * Math.min(1.3, context.distance * 0.78);
  const lateralTravel = -context.laneSide * Math.sin(p * Math.PI) * (
    type === DUNK_TYPES.REVERSE ? 0.22 : 0.06
  );

  return Object.freeze({
    type,
    progress: p,
    phase: phaseFor(p, m),
    signals: Object.freeze({ gather, rise, cock, strike, hang, landing }),
    root: Object.freeze({
      forward: forwardTravel,
      lateral: lateralTravel,
      height: rootHeight,
      turn: rootTurn,
      lean: torsoPitch * 0.38,
    }),
    torso: Object.freeze({
      pitch: torsoPitch,
      yaw: torsoYaw,
      roll: torsoRoll,
    }),
    arms: Object.freeze({
      left: armPose(leftShoulder, leftRoll, leftElbow, -ballRotation * 0.12),
      right: armPose(rightShoulder, rightRoll, rightElbow, ballRotation * 0.12),
    }),
    legs: Object.freeze({
      left: legPose(-kneeDrive * (0.28 + leftLead * 0.2), -0.04, leftKnee, landingBend * 0.12),
      right: legPose(-kneeDrive * (0.28 + rightLead * 0.2), 0.04, rightKnee, landingBend * 0.12),
    }),
    ball: Object.freeze({
      side: ballSide,
      forward: ballForward,
      height: Math.max(0.72, ballHeight),
      rotation: ballRotation,
      control: 1 - smootherstep(m.rim, m.release, p),
    }),
    rim: Object.freeze({
      contact: bell(m.rim - 0.035, m.rim, m.release + 0.025, p),
      flex: bell(m.rim, m.release, m.hangEnd, p) * (type === DUNK_TYPES.POWER_TWO_HAND ? 1 : 0.82),
      gripLeft: hang * (config.gripHands === 2 || finishHand < 0 ? 1 : 0),
      gripRight: hang * (config.gripHands === 2 || finishHand > 0 ? 1 : 0),
      netImpulse: bell(m.rim, m.release, m.release + 0.08, p),
    }),
  });
}

/**
 * Deterministic make/block/miss resolver. It returns probabilities for UI/AI,
 * but the outcome itself is based on the supplied execution snapshot.
 */
export function resolveDunkOutcome(selectionOrContext, outcomeContext = {}) {
  const selection = selectionOrContext?.type
    ? selectionOrContext
    : selectDunkChoreography(selectionOrContext || {});
  const config = styleConfig(selection.type);
  const context = selection.context || normalizeDunkContext(selectionOrContext);
  const executionQuality = clamp(finite(outcomeContext.executionQuality, 0.78));
  const rimAlignment = clamp(finite(outcomeContext.rimAlignment, 0.86));
  const defenderContest = clamp(finite(
    outcomeContext.defenderContest,
    context.defenderContest,
  ));
  const blockTiming = clamp(finite(outcomeContext.blockTiming));
  const defenderBlockRating = clamp(finite(outcomeContext.defenderBlockRating, 0.65));
  const contact = clamp(finite(outcomeContext.contact));
  const staminaControl = clamp(
    (context.stamina - config.requiredStamina + 0.45) / 0.9,
  );
  const makeProbability = clamp(
    config.baseMake
      + context.finishRating * 0.13
      + executionQuality * 0.14
      + rimAlignment * 0.09
      + staminaControl * 0.06
      - config.difficulty * 0.22
      - defenderContest * (1 - config.contestResistance) * 0.52
      - contact * 0.16,
  );
  const ballProtection = clamp(
    context.ballSecurity * 0.38
      + config.contestResistance * 0.28
      + executionQuality * 0.2
      + (selection.type === DUNK_TYPES.REVERSE ? 0.1 : 0),
  );
  const blockProbability = clamp(
    defenderContest * 0.34
      + blockTiming * 0.38
      + defenderBlockRating * 0.22
      + contact * 0.12
      - ballProtection * 0.38,
  );
  const blocked = blockTiming > 0.42
    && blockProbability > 0.42
    && blockProbability > makeProbability - 0.26;
  const made = !blocked
    && selection.eligible !== false
    && makeProbability >= 0.5
    && executionQuality + rimAlignment >= 0.78;
  const outcome = blocked
    ? DUNK_OUTCOMES.BLOCKED
    : made
      ? DUNK_OUTCOMES.MADE
      : DUNK_OUTCOMES.MISSED;
  const defenderSide = clamp(finite(outcomeContext.defenderSide, context.defenderSide), -1, 1);
  const eventType = outcome === DUNK_OUTCOMES.MADE
    ? "DUNK_MADE"
    : outcome === DUNK_OUTCOMES.BLOCKED
      ? "DUNK_BLOCKED"
      : "DUNK_MISSED";

  return Object.freeze({
    outcome,
    event: Object.freeze({
      type: eventType,
      dunkType: selection.type,
      finishHand: selection.finishHand,
      makeProbability,
      blockProbability,
      contact,
    }),
    ball: Object.freeze({
      releaseProgress: blocked
        ? Math.max(config.milestones.cock, config.milestones.rim - blockTiming * 0.08)
        : config.milestones.release,
      forceThroughRim: made,
      canScore: !blocked,
      deflection: blocked
        ? Object.freeze({
          x: defenderSide === 0 ? -(selection.finishHand || 1) * 0.72 : -defenderSide,
          y: 0.28 + (1 - blockTiming) * 0.42,
          z: 0.54,
        })
        : null,
    }),
    hooks: Object.freeze({
      score: made,
      cancelHang: blocked,
      reboundLive: !made,
      cameraImpact: made ? 0.76 : blocked ? 0.64 : 0.28,
      vfx: made ? "power_finish" : blocked ? "denial_burst" : "rim_reject",
      audio: made ? "rim_slam" : blocked ? "block_snap" : "rim_hard",
      rumble: made ? 0.88 : blocked ? 0.74 : 0.42,
    }),
    makeProbability,
    blockProbability,
  });
}

/**
 * Safe rim-hang policy. Obstruction below the player may extend a safety hang;
 * a block, loss of grip, or completed safe window always forces release.
 */
export function getDunkHangState(selectionOrType, progress, {
  outcome = DUNK_OUTCOMES.MADE,
  elapsedHangSeconds = 0,
  landingObstructed = false,
  rimDistance = 0.12,
  verticalVelocity = -0.2,
  stamina = 0.7,
} = {}) {
  const type = typeof selectionOrType === "string"
    ? selectionOrType
    : selectionOrType?.type || DUNK_TYPES.POWER_ONE_HAND;
  const config = styleConfig(type);
  const p = clamp(finite(progress));
  const m = config.milestones;
  const blocked = outcome === DUNK_OUTCOMES.BLOCKED;
  const gripRange = p >= m.rim - 0.025 && p <= m.hangEnd + 0.035;
  const handsInRange = clamp(finite(rimDistance), 0, 10) <= 0.34;
  const descendingOrAtApex = finite(verticalVelocity) <= 0.55;
  const standardLimit = config.maxHangSeconds;
  const safetyLimit = landingObstructed ? Math.max(0.58, standardLimit) : standardLimit;
  const gripLost = clamp(finite(stamina, 0.7)) < 0.08 || !handsInRange;
  const canGrip = !blocked && gripRange && handsInRange && descendingOrAtApex && !gripLost;
  const safetyHold = canGrip
    && landingObstructed
    && finite(elapsedHangSeconds) < safetyLimit;
  const mustRelease = blocked
    || gripLost
    || p > m.hangEnd + 0.035
    || (finite(elapsedHangSeconds) >= safetyLimit && !landingObstructed)
    || finite(elapsedHangSeconds) >= Math.max(0.72, safetyLimit);
  const hangWeight = mustRelease
    ? 0
    : bell(m.rim - 0.025, m.release, m.hangEnd + 0.035, p);
  return Object.freeze({
    canGrip: canGrip && !mustRelease,
    mustRelease,
    safetyHold,
    hangWeight,
    gripHands: canGrip && !mustRelease ? config.gripHands : 0,
    rimLoad: hangWeight * (config.gripHands === 2 ? 1 : 0.72),
    maxHangSeconds: safetyLimit,
    reason: blocked
      ? "blocked_finish"
      : gripLost
        ? "grip_lost"
        : safetyHold
          ? "landing_zone_obstructed"
          : mustRelease
            ? "safe_window_complete"
            : canGrip
              ? "controlled_safety_hang"
              : "not_at_rim",
  });
}

/**
 * Shared AI gate: estimates whether a dunk is a better choice than a layup.
 */
export function evaluateDunkOpportunity(rawContext = {}) {
  const selection = selectDunkChoreography(rawContext);
  const preview = resolveDunkOutcome(selection, {
    executionQuality: selection.context.finishRating,
    rimAlignment: selection.context.approachAlignment,
    defenderContest: selection.context.defenderContest,
    blockTiming: selection.context.defenderContest * 0.48,
    defenderBlockRating: finite(rawContext.defenderBlockRating, 0.62),
    contact: selection.context.traffic * 0.45,
  });
  const fatigueCost = styleConfig(selection.type).requiredStamina * 0.32
    + styleConfig(selection.type).difficulty * 0.12;
  const risk = clamp(
    preview.blockProbability * 0.62
      + (1 - preview.makeProbability) * 0.28
      + fatigueCost * 0.1,
  );
  const expectedValue = clamp(preview.makeProbability * (1 - preview.blockProbability * 0.42));
  const shouldAttempt = selection.eligible
    && expectedValue >= 0.48
    && risk <= 0.58
    && selection.context.defenderContest <= 0.92;
  return Object.freeze({
    shouldAttempt,
    alternative: shouldAttempt
      ? "dunk"
      : selection.context.distance <= 2.2
        ? "layup"
        : "pull_up",
    reason: shouldAttempt
      ? "positive_finish_window"
      : !selection.eligible
        ? selection.reason
        : risk > 0.58
          ? "block_risk"
          : "low_expected_value",
    selection,
    expectedValue,
    risk,
    makeProbability: preview.makeProbability,
    blockProbability: preview.blockProbability,
  });
}
