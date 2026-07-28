/**
 * Allocation-light, renderer-agnostic performance helpers for NOVA COURT.
 *
 * The functions in this module deliberately avoid THREE and DOM dependencies so
 * they can be unit tested in Node and integrated into either the engine or app.
 */

export const QUALITY_TIER_ORDER = Object.freeze(["performance", "balanced", "quality"]);

export const QUALITY_PRESETS = Object.freeze({
  performance: Object.freeze({
    pixelRatioCap: 1,
    shadows: false,
    shadowMapSize: 0,
    crowdDensity: 0.5,
    particleScale: 0.5,
    replaySampleHz: 20,
  }),
  balanced: Object.freeze({
    pixelRatioCap: 1.35,
    shadows: true,
    shadowMapSize: 1024,
    crowdDensity: 0.78,
    particleScale: 0.75,
    replaySampleHz: 24,
  }),
  quality: Object.freeze({
    pixelRatioCap: 1.75,
    shadows: true,
    shadowMapSize: 2048,
    crowdDensity: 1,
    particleScale: 1,
    replaySampleHz: 30,
  }),
});

const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  const index = clamp(ratio, 0, 1) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const mix = index - lower;
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * mix;
}

export function normalizeQualityTier(tier) {
  return QUALITY_TIER_ORDER.includes(tier) ? tier : "balanced";
}

export function resolveQualitySettings(tier, devicePixelRatio = 1) {
  const normalizedTier = normalizeQualityTier(tier);
  const preset = QUALITY_PRESETS[normalizedTier];
  return {
    tier: normalizedTier,
    pixelRatio: Math.min(Math.max(0.5, finiteOr(devicePixelRatio, 1)), preset.pixelRatioCap),
    shadows: preset.shadows,
    shadowMapSize: preset.shadowMapSize,
    crowdDensity: preset.crowdDensity,
    particleScale: preset.particleScale,
    replaySampleHz: preset.replaySampleHz,
  };
}

/**
 * Summarize requestAnimationFrame deltas without mutating the caller's sample set.
 * Non-finite and non-positive samples are discarded because they cannot represent
 * a useful presented frame.
 */
export function analyzeFrameTimes(frameTimesMs, targetFps = 60) {
  const validSamples = Array.from(frameTimesMs || [])
    .filter((value) => Number.isFinite(value) && value > 0);
  const sorted = [...validSamples].sort((a, b) => a - b);
  const frameBudgetMs = 1000 / Math.max(1, finiteOr(targetFps, 60));
  const total = validSamples.reduce((sum, value) => sum + value, 0);
  const averageMs = validSamples.length ? total / validSamples.length : 0;
  const overBudgetCount = validSamples.filter((value) => value > frameBudgetMs).length;
  const jankCount = validSamples.filter((value) => value > frameBudgetMs * 1.5).length;
  return {
    sampleCount: validSamples.length,
    frameBudgetMs,
    averageMs,
    medianMs: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
    worstMs: sorted.at(-1) || 0,
    effectiveFps: averageMs > 0 ? 1000 / averageMs : 0,
    overBudgetRatio: validSamples.length ? overBudgetCount / validSamples.length : 0,
    jankRatio: validSamples.length ? jankCount / validSamples.length : 0,
  };
}

/**
 * Pure hysteresis decision for adaptive quality. Call no more than once every few
 * seconds and pass cooldownReady=false while a prior quality change settles.
 */
export function recommendQualityTier(frameTimesMs, currentTier = "balanced", options = {}) {
  const tier = normalizeQualityTier(currentTier);
  const stats = analyzeFrameTimes(frameTimesMs, options.targetFps ?? 60);
  const minimumSamples = Math.max(1, Math.floor(options.minimumSamples ?? 90));
  if (stats.sampleCount < minimumSamples) {
    return { tier, changed: false, direction: "hold", reason: "insufficient-samples", stats };
  }
  if (options.cooldownReady === false) {
    return { tier, changed: false, direction: "hold", reason: "cooldown", stats };
  }

  const currentIndex = QUALITY_TIER_ORDER.indexOf(tier);
  const downgradeP95Ratio = finiteOr(options.downgradeP95Ratio, 1.15);
  const downgradeJankRatio = finiteOr(options.downgradeJankRatio, 0.12);
  const upgradeP95Ratio = finiteOr(options.upgradeP95Ratio, 0.82);
  const upgradeOverBudgetRatio = finiteOr(options.upgradeOverBudgetRatio, 0.025);
  const shouldDowngrade =
    stats.p95Ms > stats.frameBudgetMs * downgradeP95Ratio ||
    stats.jankRatio > downgradeJankRatio;
  const shouldUpgrade =
    stats.p95Ms < stats.frameBudgetMs * upgradeP95Ratio &&
    stats.overBudgetRatio <= upgradeOverBudgetRatio;

  if (shouldDowngrade && currentIndex > 0) {
    return {
      tier: QUALITY_TIER_ORDER[currentIndex - 1],
      changed: true,
      direction: "down",
      reason: stats.jankRatio > downgradeJankRatio ? "jank" : "p95-over-budget",
      stats,
    };
  }
  if (shouldUpgrade && currentIndex < QUALITY_TIER_ORDER.length - 1) {
    return {
      tier: QUALITY_TIER_ORDER[currentIndex + 1],
      changed: true,
      direction: "up",
      reason: "sustained-headroom",
      stats,
    };
  }
  return {
    tier,
    changed: false,
    direction: "hold",
    reason: shouldDowngrade ? "minimum-tier" : shouldUpgrade ? "maximum-tier" : "within-hysteresis",
    stats,
  };
}

/**
 * Convert a variable frame delta into a bounded fixed-step plan. Complete steps
 * beyond maxSubSteps are intentionally discarded to prevent a slow frame from
 * causing a physics catch-up spiral on the next frame.
 */
export function planFixedSteps(accumulatorSeconds, frameDeltaSeconds, options = {}) {
  const fixedStep = Math.max(1 / 1000, finiteOr(options.fixedStep, 1 / 120));
  const maxFrameDelta = Math.max(fixedStep, finiteOr(options.maxFrameDelta, 1 / 20));
  const maxSubSteps = Math.max(1, Math.floor(finiteOr(options.maxSubSteps, 4)));
  const timeScale = Math.max(0, finiteOr(options.timeScale, 1));
  const priorAccumulator = clamp(finiteOr(accumulatorSeconds, 0), 0, fixedStep * 2);
  const clampedFrameDelta = clamp(finiteOr(frameDeltaSeconds, 0), 0, maxFrameDelta);
  const scaledFrameDelta = clampedFrameDelta * timeScale;
  const total = priorAccumulator + scaledFrameDelta;
  const requestedSteps = Math.floor((total + Number.EPSILON) / fixedStep);
  const steps = Math.min(requestedSteps, maxSubSteps);
  const droppedSteps = Math.max(0, requestedSteps - steps);
  const completedTime = requestedSteps * fixedStep;
  const nextAccumulator = clamp(total - completedTime, 0, fixedStep * (1 - 1e-9));

  return {
    fixedStep,
    clampedFrameDelta,
    scaledFrameDelta,
    requestedSteps,
    steps,
    droppedSteps,
    droppedTime: droppedSteps * fixedStep,
    nextAccumulator,
    interpolationAlpha: nextAccumulator / fixedStep,
    saturated: droppedSteps > 0,
  };
}

export function recommendPoolCapacity(options = {}) {
  const peakSpawnPerSecond = Math.max(0, finiteOr(options.peakSpawnPerSecond, 0));
  const maxLifetimeSeconds = Math.max(0, finiteOr(options.maxLifetimeSeconds, 0));
  const burstReserve = Math.max(0, Math.ceil(finiteOr(options.burstReserve, 0)));
  const headroom = Math.max(1, finiteOr(options.headroom, 1.25));
  const minimum = Math.max(0, Math.ceil(finiteOr(options.minimum, 16)));
  const maximum = Math.max(minimum, Math.ceil(finiteOr(options.maximum, 256)));
  const concurrentEstimate = peakSpawnPerSecond * maxLifetimeSeconds + burstReserve;
  return clamp(Math.ceil(concurrentEstimate * headroom), minimum, maximum);
}

/**
 * Decide how much optional pooled work to admit. Above the soft threshold the
 * caller can reduce cosmetic emission; at capacity it drops work rather than
 * allocating new objects during gameplay.
 */
export function calculatePoolReusePlan(options = {}) {
  const capacity = Math.max(0, Math.floor(finiteOr(options.capacity, 0)));
  const activeCount = clamp(Math.floor(finiteOr(options.activeCount, 0)), 0, capacity);
  const requestedCount = Math.max(0, Math.floor(finiteOr(options.requestedCount, 0)));
  const softThreshold = clamp(finiteOr(options.softThreshold, 0.78), 0, 1);
  const availableCount = capacity - activeCount;
  const admittedCount = Math.min(availableCount, requestedCount);
  const droppedCount = requestedCount - admittedCount;
  const utilization = capacity > 0 ? activeCount / capacity : 1;
  const cosmeticScale = utilization <= softThreshold
    ? 1
    : clamp((1 - utilization) / Math.max(1e-6, 1 - softThreshold), 0, 1);
  return {
    capacity,
    activeCount,
    availableCount,
    requestedCount,
    admittedCount,
    droppedCount,
    utilization,
    cosmeticScale,
    shouldAllocate: false,
    saturated: droppedCount > 0,
  };
}

/**
 * Return a vertical visual-rig correction from measured foot-sole world heights.
 * Keep the physics root at y=0; apply the returned correction to a visual/model
 * wrapper or to the rig's base hip height.
 */
export function calculateFootGroundCorrection(options = {}) {
  const rootY = finiteOr(options.rootY, 0);
  const floorY = finiteOr(options.floorY, 0);
  const soleClearance = Math.max(0, finiteOr(options.soleClearance, 0.006));
  const grounded = options.grounded !== false;
  const footBottoms = Array.from(options.footBottoms || [])
    .filter((value) => Number.isFinite(value));
  if (!grounded || footBottoms.length === 0) {
    return {
      correctionY: 0,
      correctedRootY: rootY,
      lowestFootY: footBottoms.length ? Math.min(...footBottoms) : null,
      penetration: 0,
      valid: footBottoms.length > 0,
    };
  }
  const lowestFootY = Math.min(...footBottoms);
  const targetFootY = floorY + soleClearance;
  const rawCorrection = targetFootY - lowestFootY;
  const maxRise = Math.max(0, finiteOr(options.maxRise, 0.45));
  const maxDrop = Math.max(0, finiteOr(options.maxDrop, 0.08));
  const correctionY = clamp(rawCorrection, -maxDrop, maxRise);
  return {
    correctionY,
    correctedRootY: rootY + correctionY,
    lowestFootY,
    targetFootY,
    penetration: Math.max(0, floorY - lowestFootY),
    clamped: correctionY !== rawCorrection,
    valid: true,
  };
}

/**
 * Frame-rate-independent smoothing for a visual foot-plant offset. Faster rise
 * prevents clipping; slower release prevents visible vertical popping.
 */
export function dampFootGroundCorrection(previousCorrection, targetCorrection, dt, options = {}) {
  const previous = finiteOr(previousCorrection, 0);
  const target = finiteOr(targetCorrection, 0);
  const riseLambda = Math.max(0, finiteOr(options.riseLambda, 28));
  const releaseLambda = Math.max(0, finiteOr(options.releaseLambda, 12));
  const lambda = target > previous ? riseLambda : releaseLambda;
  const factor = 1 - Math.exp(-lambda * Math.max(0, finiteOr(dt, 0)));
  return previous + (target - previous) * factor;
}
