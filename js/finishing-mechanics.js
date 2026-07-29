import {
  isShotMeterPerfect,
  SHOT_METER_IDEAL,
  SHOT_METER_PERFECT_HALF_WIDTH,
} from "./shot-coverage.js";

export const FINISHING_MECHANICS_VERSION = "1.0.0";

export const CONTEXTUAL_I_ACTIONS = Object.freeze({
  DUNK: "dunk",
  STEAL: "steal",
  NONE: "none",
});

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(Number(value)) ? Number(value) : minimum));

/**
 * I is deliberately contextual: it starts a timed dunk only for the live
 * offensive ball handler in the launch area. Everywhere else it remains the
 * defensive reach/steal action players already know.
 */
export function resolveContextualIAction({
  hasBall = false,
  isOffense = false,
  distanceToRim = Infinity,
  stamina = 1,
  actionLocked = false,
  dunkRadius = 2.05,
} = {}) {
  const canDunk = hasBall
    && isOffense
    && !actionLocked
    && Number(distanceToRim) <= Math.max(0.8, Number(dunkRadius) || 2.05)
    && clamp(stamina) >= 0.16;
  if (canDunk) {
    return Object.freeze({
      action: CONTEXTUAL_I_ACTIONS.DUNK,
      prompt: "HOLD I · RELEASE IN GREEN",
      available: true,
    });
  }
  if (!hasBall || !isOffense) {
    return Object.freeze({
      action: CONTEXTUAL_I_ACTIONS.STEAL,
      prompt: "I · REACH",
      available: true,
    });
  }
  return Object.freeze({
    action: CONTEXTUAL_I_ACTIONS.NONE,
    prompt: null,
    available: false,
  });
}

/**
 * Close layups use an authored bank target and a single-contact contract. The
 * engine may still block the ball before it reaches the glass, but once the
 * bank begins it cannot ping-pong between the board and rim.
 */
export function planLayupBank({
  shooterPosition = { x: 0, z: 0 },
  rimPosition = { x: 0, y: 3.05, z: -5.7 },
  backboardZ = -6.16,
  attackSign = -1,
  contested = false,
} = {}) {
  const shooterX = Number(shooterPosition?.x) || 0;
  const rimX = Number(rimPosition?.x) || 0;
  const side = Math.sign(shooterX - rimX) || 1;
  const contestLift = contested ? 0.05 : 0;
  return Object.freeze({
    target: Object.freeze({
      x: rimX + side * Math.min(0.29, Math.abs(shooterX - rimX) * 0.15 + 0.08),
      y: (Number(rimPosition?.y) || 3.05) + 0.32 + contestLift,
      z: (Number(backboardZ) || -6.16) + (Number(attackSign) || -1) * 0.02,
    }),
    guaranteedMake: true,
    requiresBackboard: true,
    maxBackboardContacts: 1,
    postContactSeconds: contested ? 0.2 : 0.22,
  });
}

export function resolveFreeThrowRelease({
  charge = 0,
  rating = 0.7,
  outcomeValue = 0.5,
  ideal = SHOT_METER_IDEAL,
  halfWidth = SHOT_METER_PERFECT_HALF_WIDTH,
} = {}) {
  const perfectRelease = isShotMeterPerfect(charge, ideal, halfWidth);
  const timingQuality = 1 - clamp(Math.abs(Number(charge) - ideal) / 0.42);
  const makeProbability = perfectRelease
    ? 1
    : clamp(0.18 + clamp(rating) * 0.5 + timingQuality * 0.25, 0.18, 0.88);
  return Object.freeze({
    perfectRelease,
    guaranteed: perfectRelease,
    timingQuality,
    makeProbability,
    made: perfectRelease || clamp(outcomeValue) < makeProbability,
    points: 1,
  });
}

export class FreeThrowFlow {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;
    this.shooterId = null;
    this.teamId = null;
    this.attemptsRemaining = 0;
    this.phase = "idle";
    this.lastResult = null;
    return this.getState();
  }

  start({ shooterId, teamId, attempts = 1 } = {}) {
    this.active = true;
    this.shooterId = shooterId ?? null;
    this.teamId = teamId ?? null;
    this.attemptsRemaining = Math.max(1, Math.floor(Number(attempts) || 1));
    this.phase = "ready";
    this.lastResult = null;
    return Object.freeze({
      state: this.getState(),
      commands: Object.freeze([
        Object.freeze({ type: "POSITION_FREE_THROW", shooterId: this.shooterId, teamId: this.teamId }),
        Object.freeze({ type: "SHOW_FREE_THROW_METER", attempts: this.attemptsRemaining }),
      ]),
    });
  }

  beginCharge() {
    if (!this.active || this.phase !== "ready") return false;
    this.phase = "charging";
    return true;
  }

  release(input = {}) {
    if (!this.active || !["ready", "charging"].includes(this.phase)) return null;
    const result = resolveFreeThrowRelease(input);
    this.lastResult = result;
    this.phase = "in_flight";
    return result;
  }

  resolve(made = this.lastResult?.made === true) {
    if (!this.active || this.phase !== "in_flight") return null;
    this.attemptsRemaining = Math.max(0, this.attemptsRemaining - 1);
    const complete = this.attemptsRemaining === 0;
    this.phase = complete ? "complete" : "ready";
    this.active = !complete;
    return Object.freeze({
      made: Boolean(made),
      complete,
      attemptsRemaining: this.attemptsRemaining,
      commands: Object.freeze(complete
        ? [Object.freeze({ type: "END_FREE_THROWS", made: Boolean(made) })]
        : [Object.freeze({ type: "POSITION_FREE_THROW", shooterId: this.shooterId, teamId: this.teamId })]),
    });
  }

  getState() {
    return Object.freeze({
      active: this.active,
      shooterId: this.shooterId,
      teamId: this.teamId,
      attemptsRemaining: this.attemptsRemaining,
      phase: this.phase,
      lastResult: this.lastResult,
    });
  }
}

const MADE_SHOT_REPLAY_DISABLED_MODES = new Set([
  "open_gym",
  "three_point_contest",
]);

export const shouldQueueMadeShotReplay = (modeId) =>
  !MADE_SHOT_REPLAY_DISABLED_MODES.has(modeId);

export const shouldEnforceOutOfBounds = (modeId) => modeId !== "open_gym";

