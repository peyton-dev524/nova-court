/**
 * Pure continuity helpers for procedural basketball motion.
 *
 * These helpers contain no THREE or DOM dependencies. They are intended to make
 * handle transitions, shot phases, bounce events, and gait timing deterministic
 * without borrowing animation data from any commercial game or real athlete.
 */

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;

export function smootherstep01(value) {
  const t = clamp(finiteOr(value, 0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function sampleActionProgress(startTime, duration, now) {
  const safeDuration = Math.max(1e-6, finiteOr(duration, 0));
  return clamp((finiteOr(now, startTime) - finiteOr(startTime, 0)) / safeDuration, 0, 1);
}

export function handleTargetDistance(a, b) {
  const side = finiteOr(a?.side, 0) - finiteOr(b?.side, 0);
  const height = finiteOr(a?.height, 0) - finiteOr(b?.height, 0);
  const forward = finiteOr(a?.forward, 0) - finiteOr(b?.forward, 0);
  return Math.hypot(side, height, forward);
}

/**
 * Crossfade two live handle targets. Re-sample outgoing and incoming paths each
 * frame, then pass them here. Quintic easing has zero first and second derivative
 * at both ends, preventing a fresh move from adding another visible ball snap.
 */
export function blendHandleTargets(outgoing, incoming, transitionProgress) {
  const weight = smootherstep01(transitionProgress);
  const mix = (key) => finiteOr(outgoing?.[key], 0) +
    (finiteOr(incoming?.[key], 0) - finiteOr(outgoing?.[key], 0)) * weight;
  return {
    side: mix("side"),
    height: mix("height"),
    forward: mix("forward"),
    endHand: weight < 0.5 ? outgoing?.endHand : incoming?.endHand,
    blendWeight: weight,
  };
}

/**
 * Advance a normalized 0..1 cycle and report all wrap crossings. This avoids
 * narrow `phase < epsilon` checks that can miss bounces on long frames.
 */
export function advancePeriodicPhase(previousPhase, deltaCycles) {
  const prior = finiteOr(previousPhase, 0);
  const normalizedPrior = ((prior % 1) + 1) % 1;
  const delta = Math.max(0, finiteOr(deltaCycles, 0));
  const total = normalizedPrior + delta;
  const crossings = Math.floor(total + 1e-12);
  return {
    phase: total - crossings,
    crossings,
  };
}

/**
 * Tie gait phase to ground distance rather than a fixed clock cadence. The caller
 * supplies actual root displacement after collision resolution.
 */
export function advanceDistanceDrivenGait(previousPhaseRadians, distanceTravelled, distancePerCycle = 1.5) {
  const cycleDistance = Math.max(1e-4, finiteOr(distancePerCycle, 1.5));
  const delta = Math.max(0, finiteOr(distanceTravelled, 0)) / cycleDistance * Math.PI * 2;
  const total = finiteOr(previousPhaseRadians, 0) + delta;
  return ((total % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

const smoothstep = (minimum, maximum, value) => {
  const t = clamp((value - minimum) / Math.max(1e-6, maximum - minimum), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Original procedural shooting phases with separate action and release clocks.
 * `shotElapsed` never resets. `releaseElapsed` begins at zero when the ball leaves
 * the hand, so the gathered set point cannot collapse during follow-through.
 */
export function sampleShotFormTiming(options = {}) {
  const shotElapsed = Math.max(0, finiteOr(options.shotElapsed, 0));
  const releaseElapsed = Math.max(0, finiteOr(options.releaseElapsed, 0));
  const peakJumpVelocity = Math.max(0.01, finiteOr(options.peakJumpVelocity, 4.5));
  const jumpVelocity = finiteOr(options.jumpVelocity, 0);
  const released = options.released === true;
  const gather = smoothstep(0.04, 0.28, shotElapsed);
  const dip = shotElapsed <= 0.09
    ? smoothstep(0, 0.09, shotElapsed)
    : 1 - smoothstep(0.09, 0.19, shotElapsed);
  const load = smoothstep(0.02, 0.2, shotElapsed);
  const apexFactor = 1 - clamp(Math.max(0, jumpVelocity) / peakJumpVelocity, 0, 1);
  const setPoint = Math.max(gather, apexFactor * 0.94);
  const elbowStack = smoothstep(0.1, 0.34, shotElapsed);
  const followThrough = released ? smoothstep(0, 0.18, releaseElapsed) : 0;
  const wristSnap = released ? smoothstep(0.02, 0.22, releaseElapsed) : 0;
  const guideRelease = released ? smoothstep(0.04, 0.26, releaseElapsed) : 0;
  return {
    gather,
    dip,
    load,
    setPoint,
    elbowStack,
    torsoLift: smoothstep(0.08, 0.34, shotElapsed) * 0.1,
    followThrough,
    wristSnap,
    guideRelease,
    kneeBend: (1 - setPoint) * 0.52 + dip * 0.12 + (released ? 0.06 : 0),
  };
}
