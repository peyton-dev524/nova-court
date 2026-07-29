/**
 * Deterministic shot coverage, make-percentage, and rim-result logic.
 *
 * Inputs are simulation facts only. Random variation is supplied explicitly as
 * normalized values, allowing the runtime to use its seeded gameplay RNG.
 */

export const SHOT_COVERAGE_VERSION = "1.0.0";

export const SHOT_METER_IDEAL = 0.72;
export const SHOT_METER_PERFECT_HALF_WIDTH = 0.036;

export function isShotMeterPerfect(
  charge,
  ideal = SHOT_METER_IDEAL,
  halfWidth = SHOT_METER_PERFECT_HALF_WIDTH,
) {
  return resolveShotMeterWindow(charge, ideal, halfWidth).perfect;
}

/**
 * Canonical meter snapshot shared by presentation and shot resolution.
 * Keeping the normalized visible window and its perfect decision together
 * prevents a displayed green release from being judged by a second threshold.
 */
export function resolveShotMeterWindow(
  charge,
  ideal = SHOT_METER_IDEAL,
  halfWidth = SHOT_METER_PERFECT_HALF_WIDTH,
) {
  const normalizedCharge = clamp(finite(charge));
  const normalizedIdeal = clamp(finite(ideal, SHOT_METER_IDEAL));
  const normalizedHalfWidth = Math.max(
    0.005,
    finite(halfWidth, SHOT_METER_PERFECT_HALF_WIDTH),
  );
  const start = clamp(normalizedIdeal - normalizedHalfWidth);
  const end = clamp(normalizedIdeal + normalizedHalfWidth);
  return Object.freeze({
    charge: normalizedCharge,
    ideal: normalizedIdeal,
    halfWidth: normalizedHalfWidth,
    start,
    end,
    width: end - start,
    perfect: normalizedCharge >= start - 1e-9
      && normalizedCharge <= end + 1e-9,
  });
}

export function shotFacingDirection(
  shooterPosition = { x: 0, z: 0 },
  rimPosition = { x: 0, z: -1 },
) {
  return normalize2({
    x: finite(rimPosition?.x) - finite(shooterPosition?.x),
    z: finite(rimPosition?.z) - finite(shooterPosition?.z),
  });
}

export const COVERAGE_LABELS = Object.freeze({
  WIDE_OPEN: "wide_open",
  OPEN: "open",
  LIGHT: "light_contest",
  CONTESTED: "contested",
  SMOTHERED: "smothered",
});

export const RIM_RESULTS = Object.freeze({
  CLEAN_SWISH: "clean_swish",
  SOFT_RIM_IN: "soft_rim_bounce_in",
  RIM_OUT: "rim_out",
  BANK: "bank",
});

export const RANGE_LABELS = Object.freeze({
  AT_RIM: "at_rim",
  MID_RANGE: "mid_range",
  THREE: "three",
  DEEP: "deep",
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
const distance3 = (a, b) => Math.hypot(
  finite(a?.x) - finite(b?.x),
  finite(a?.y) - finite(b?.y),
  finite(a?.z) - finite(b?.z),
);
const length2 = (vector) => Math.hypot(finite(vector?.x), finite(vector?.z));
const normalize2 = (vector) => {
  const length = length2(vector);
  return length > 1e-6
    ? { x: finite(vector?.x) / length, z: finite(vector?.z) / length }
    : { x: 0, z: -1 };
};
const dot2 = (a, b) => finite(a?.x) * finite(b?.x) + finite(a?.z) * finite(b?.z);
const smoothstep = (edge0, edge1, value) => {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

function coverageLabel(value) {
  if (value < 0.08) return COVERAGE_LABELS.WIDE_OPEN;
  if (value < 0.24) return COVERAGE_LABELS.OPEN;
  if (value < 0.46) return COVERAGE_LABELS.LIGHT;
  if (value < 0.72) return COVERAGE_LABELS.CONTESTED;
  return COVERAGE_LABELS.SMOTHERED;
}

function displayLabel(label) {
  return String(label || "")
    .replaceAll("_", " ")
    .toUpperCase();
}

export function classifyShotRange(distance, threePointDistance = 6.15) {
  const range = Math.max(0, finite(distance));
  if (range <= 2.1) return RANGE_LABELS.AT_RIM;
  if (range < finite(threePointDistance, 6.15)) return RANGE_LABELS.MID_RANGE;
  if (range <= finite(threePointDistance, 6.15) + 2.15) return RANGE_LABELS.THREE;
  return RANGE_LABELS.DEEP;
}

export function scoreReleaseTiming({
  releaseQuality,
  releaseErrorSeconds,
  perfectRelease = false,
  idealWindowSeconds = 0.12,
} = {}) {
  if (perfectRelease) return Object.freeze({
    quality: 1,
    label: "perfect",
    errorSeconds: 0,
  });
  const error = Math.abs(finite(releaseErrorSeconds));
  const quality = releaseQuality == null
    ? 1 - clamp(error / Math.max(0.03, finite(idealWindowSeconds, 0.12) * 3.2))
    : clamp(finite(releaseQuality));
  return Object.freeze({
    quality,
    label: quality >= 0.94
      ? "excellent"
      : quality >= 0.75
        ? "good"
        : quality >= 0.48
          ? "early_late"
          : "poor",
    errorSeconds: error,
  });
}

/**
 * Coverage for one defender. Angle measures whether the defender is between the
 * shooter and rim; timing measures proximity to the release; height/reach and
 * an active block window increase the disruption ceiling.
 */
export function calculateDefenderCoverage({
  shooterPosition = { x: 0, y: 0, z: 0 },
  rimPosition = { x: 0, y: 3.05, z: -5.7 },
  releaseHeight = 2.25,
  defender = {},
  contestRange = 2.25,
  groundedContestStrength = 0.6,
} = {}) {
  const shooter = pointOf(shooterPosition);
  const rim = pointOf(rimPosition);
  const defenderPosition = pointOf(defender.position);
  const planarDistance = Math.hypot(
    defenderPosition.x - shooter.x,
    defenderPosition.z - shooter.z,
  );
  const shotDirection = normalize2({ x: rim.x - shooter.x, z: rim.z - shooter.z });
  const defenderDirection = normalize2({
    x: defenderPosition.x - shooter.x,
    z: defenderPosition.z - shooter.z,
  });
  const frontAngle = clamp((dot2(shotDirection, defenderDirection) + 0.15) / 1.15);
  const distanceFactor = 1 - smoothstep(0.35, Math.max(0.5, finite(contestRange, 2.25)), planarDistance);
  const timingDelta = Math.abs(finite(
    defender.contestTiming,
    defender.releaseDeltaSeconds ?? 0.42,
  ));
  const timingFactor = 1 - smoothstep(0.08, 0.62, timingDelta);
  const defenderHeight = Math.max(1.45, finite(defender.height, 1.9));
  const reachBonus = clamp(finite(defender.reach, (defenderHeight - 1.55) / 0.65));
  const vertical = clamp(finite(defender.vertical, 0.65));
  const releaseAdvantage = clamp(
    (defenderHeight + reachBonus * 0.42 + vertical * 0.32 - finite(releaseHeight, 2.25) + 0.65) / 1.25,
  );
  const blockWindow = clamp(
    finite(defender.blockWindow, defender.blockWindowActive ? 1 : 0) / 0.42,
  );
  const handDistance = defender.handPosition
    ? distance3(defender.handPosition, {
      x: shooter.x,
      y: finite(releaseHeight, 2.25),
      z: shooter.z,
    })
    : Infinity;
  const handPressure = Number.isFinite(handDistance)
    ? 1 - smoothstep(0.18, 1.15, handDistance)
    : 0;
  const contestIntent = clamp(finite(defender.contestIntent, defender.isContesting ? 1 : 0.55));
  const unscaledCoverage = clamp(
    distanceFactor
      * (0.28 + frontAngle * 0.2)
      * (0.3 + timingFactor * 0.38 + contestIntent * 0.18)
      + releaseAdvantage * distanceFactor * timingFactor * 0.13
      + blockWindow * distanceFactor * (0.15 + handPressure * 0.13),
  );
  const contestStrengthMultiplier = blockWindow > 0
    ? 1
    : clamp(finite(groundedContestStrength, 0.6));
  const coverage = clamp(unscaledCoverage * contestStrengthMultiplier);

  return Object.freeze({
    defenderId: defender.id ?? null,
    coverage,
    percent: Math.round(coverage * 100),
    label: coverageLabel(coverage),
    breakdown: Object.freeze({
      planarDistance,
      frontAngle,
      distanceFactor,
      timingFactor,
      timingDelta,
      releaseAdvantage,
      blockWindow,
      handPressure,
      contestIntent,
      unscaledCoverage,
      contestStrengthMultiplier,
    }),
  });
}

/**
 * Aggregates multiple defenders with diminishing overlap. A second helper can
 * matter without double-counting the same 100% of the release space.
 */
export function calculateShotCoverage({
  shooterPosition,
  rimPosition,
  releaseHeight = 2.25,
  defenders = [],
  contestRange = 2.25,
  groundedContestStrength = 0.6,
} = {}) {
  const individual = defenders
    .map((defender) => calculateDefenderCoverage({
      shooterPosition,
      rimPosition,
      releaseHeight,
      defender,
      contestRange,
      groundedContestStrength,
    }))
    .sort((a, b) => b.coverage - a.coverage || String(a.defenderId).localeCompare(String(b.defenderId)));
  const combined = clamp(
    1 - individual.reduce((uncovered, entry, index) =>
      uncovered * (1 - entry.coverage * (index === 0 ? 1 : 0.55)), 1),
    0,
    0.96,
  );
  const label = coverageLabel(combined);
  return Object.freeze({
    coverage: combined,
    percent: Math.round(combined * 100),
    label,
    displayLabel: displayLabel(label),
    primaryDefenderId: individual[0]?.defenderId ?? null,
    defenders: Object.freeze(individual),
    hud: Object.freeze({
      coverageLabel: displayLabel(label),
      coveragePercent: `${Math.round(combined * 100)}% COVERED`,
    }),
  });
}

export function hasMeaningfulJumpContest(coverageResult) {
  return Boolean(coverageResult?.defenders?.some((entry) =>
    entry.coverage >= 0.08 && entry.breakdown?.blockWindow > 0));
}

export function normalizeGameplayRating(value, fallback = 0.68) {
  const resolved = finite(value, fallback);
  return clamp(resolved > 1 ? resolved / 100 : resolved);
}

export function shotAttributeForContext({
  shotContext = "jumper",
  distance = 0,
  movementSpeed = 0,
  threePointDistance = 6.15,
} = {}) {
  if (shotContext === "free_throw") return "freeThrow";
  if (shotContext === "dunk") return "drivingDunk";
  if (shotContext === "layup") return movementSpeed > 0.8 ? "drivingLayup" : "closeShot";
  const range = classifyShotRange(distance, threePointDistance);
  if (range === RANGE_LABELS.AT_RIM) return "closeShot";
  return range === RANGE_LABELS.MID_RANGE ? "midRange" : "threePoint";
}

export function ratingForShotContext(ratings = {}, context = {}) {
  const general = normalizeGameplayRating(ratings.shooting, 0.68);
  const ratingKey = shotAttributeForContext(context);
  const aliases = {
    closeShot: ratings.close ?? ratings.finishing,
    drivingLayup: ratings.layup ?? ratings.finishing,
    drivingDunk: ratings.dunk ?? ratings.finishing,
    midRange: ratings.mid,
    threePoint: ratings.three,
    freeThrow: ratings.freeThrow,
  };
  return Object.freeze({
    ratingKey,
    rating: normalizeGameplayRating(ratings[ratingKey], aliases[ratingKey] ?? general),
  });
}

function difficultyAdjustment(difficulty, isAI) {
  if (isAI) {
    if (difficulty === "rookie") return -0.045;
    if (difficulty === "legend" || difficulty === "allStar") return 0.035;
    return 0;
  }
  if (difficulty === "rookie") return 0.035;
  if (difficulty === "legend" || difficulty === "allStar") return -0.02;
  return 0;
}

/**
 * Explainable make probability. A valid wide-open perfect release is always
 * guaranteed. Every valid user-controlled green keeps that promise through
 * coverage; the live ball/block collision system can still reject the shot
 * when a defender actually touches it.
 */
export function calculateShotMakePercentage({
  coverage,
  coverageResult,
  releaseQuality,
  releaseErrorSeconds,
  perfectRelease = false,
  distance,
  shooterPosition = { x: 0, y: 0, z: 0 },
  rimPosition = { x: 0, y: 3.05, z: -5.7 },
  ratings = {},
  stamina = 1,
  difficulty = "pro",
  isAI = false,
  userControlled = false,
  shotContext = "jumper",
  movementSpeed = 0,
  threePointDistance = 6.15,
  maxValidDistance = 12,
} = {}) {
  const resolvedCoverage = clamp(finite(coverage, coverageResult?.coverage ?? 0));
  const shotDistance = distance == null
    ? Math.hypot(
      finite(shooterPosition.x) - finite(rimPosition.x),
      finite(shooterPosition.z) - finite(rimPosition.z),
    )
    : Math.max(0, finite(distance));
  const rangeLabel = classifyShotRange(shotDistance, threePointDistance);
  const ratingSelection = ratingForShotContext(ratings, {
    shotContext,
    distance: shotDistance,
    movementSpeed,
    threePointDistance,
  });
  const shootingRating = ratingSelection.rating;
  const release = scoreReleaseTiming({ releaseQuality, releaseErrorSeconds, perfectRelease });
  const wideOpen = resolvedCoverage < 0.08;
  const validShot = shotDistance <= Math.max(1, finite(maxValidDistance, 12));
  const perfectTiming = release.quality >= 0.999;
  const jumpContested = hasMeaningfulJumpContest(coverageResult);
  const guaranteed = validShot && perfectTiming && (wideOpen || userControlled);
  const baseByRange = {
    [RANGE_LABELS.AT_RIM]: 0.7,
    [RANGE_LABELS.MID_RANGE]: 0.47,
    [RANGE_LABELS.THREE]: 0.36,
    [RANGE_LABELS.DEEP]: 0.22,
  };
  const ratingContribution = (shootingRating - 0.5) * (
    rangeLabel === RANGE_LABELS.AT_RIM ? 0.42 : 0.5
  );
  const timingContribution = (release.quality - 0.5) * 0.34;
  const staminaPenalty = (1 - clamp(finite(stamina, 1))) * 0.16;
  const deepDistance = Math.max(0, shotDistance - (finite(threePointDistance, 6.15) + 1.8));
  const rangePenalty = Math.min(0.22, deepDistance * 0.036);
  const coveragePenalty = resolvedCoverage * (
    0.44 + (1 - shootingRating) * 0.13 + (1 - release.quality) * 0.08
  );
  const raw = finite(baseByRange[rangeLabel], 0.4)
    + ratingContribution
    + timingContribution
    + difficultyAdjustment(difficulty, isAI)
    - staminaPenalty
    - rangePenalty
    - coveragePenalty;
  const makeProbability = guaranteed ? 1 : clamp(raw, validShot ? 0.025 : 0.005, 0.965);
  const makePercent = Math.round(makeProbability * 100);
  const coverageName = coverageLabel(resolvedCoverage);

  return Object.freeze({
    makeProbability,
    makePercent,
    guaranteed,
    jumpContested,
    validShot,
    coverage: resolvedCoverage,
    coverageLabel: coverageName,
    releaseQuality: release.quality,
    releaseLabel: release.label,
    rangeLabel,
    distance: shotDistance,
    ratingKey: ratingSelection.ratingKey,
    shootingRating,
    hud: Object.freeze({
      makePercent: `${makePercent}%`,
      coverageLabel: displayLabel(coverageName),
      coveragePercent: `${Math.round(resolvedCoverage * 100)}% COVERED`,
      releaseLabel: displayLabel(release.label),
      rangeLabel: displayLabel(rangeLabel),
    }),
    breakdown: Object.freeze({
      base: baseByRange[rangeLabel],
      ratingContribution,
      timingContribution,
      difficultyAdjustment: difficultyAdjustment(difficulty, isAI),
      staminaPenalty,
      rangePenalty,
      coveragePenalty,
    }),
  });
}

/**
 * Selects visible rim behavior independently from make/miss determination.
 * Even guaranteed makes can be a soft bounce-in or intentional bank.
 */
export function selectRimResult({
  made,
  makeProbability = 0.5,
  releaseQuality = 0.7,
  coverage = 0,
  bankIntent = 0,
  bankAngleQuality = 0.7,
  rimValue = 0.5,
} = {}) {
  const value = clamp(finite(rimValue, 0.5));
  const resolvedBankIntent = clamp(finite(bankIntent));
  const bankChance = clamp(
    resolvedBankIntent * (0.36 + clamp(finite(bankAngleQuality, 0.7)) * 0.44),
    0,
    0.72,
  );
  if (value < bankChance) {
    return Object.freeze({
      result: RIM_RESULTS.BANK,
      made: Boolean(made),
      bankMade: Boolean(made),
      swish: false,
      rimContacts: made ? 0 : 1,
      backboardContacts: 1,
    });
  }
  if (!made) {
    return Object.freeze({
      result: RIM_RESULTS.RIM_OUT,
      made: false,
      bankMade: false,
      swish: false,
      rimContacts: 1 + Math.round((1 - value) * 2),
      backboardContacts: 0,
    });
  }
  const swishChance = clamp(
    0.26
      + clamp(finite(releaseQuality, 0.7)) * 0.46
      + clamp(finite(makeProbability, 0.5)) * 0.16
      - clamp(finite(coverage)) * 0.22,
    0.18,
    0.88,
  );
  const adjusted = bankChance >= 1 ? 1 : (value - bankChance) / (1 - bankChance);
  const swish = adjusted < swishChance;
  return Object.freeze({
    result: swish ? RIM_RESULTS.CLEAN_SWISH : RIM_RESULTS.SOFT_RIM_IN,
    made: true,
    bankMade: false,
    swish,
    rimContacts: swish ? 0 : 1,
    backboardContacts: 0,
  });
}

export function resolveShotAttempt(input = {}) {
  const percentage = input.percentageResult
    || calculateShotMakePercentage(input);
  const outcomeValue = clamp(finite(input.outcomeValue, 0.5));
  const made = percentage.guaranteed || outcomeValue < percentage.makeProbability;
  const rim = selectRimResult({
    made,
    makeProbability: percentage.makeProbability,
    releaseQuality: percentage.releaseQuality,
    coverage: percentage.coverage,
    bankIntent: input.bankIntent,
    bankAngleQuality: input.bankAngleQuality,
    rimValue: input.rimValue,
  });
  return Object.freeze({
    made,
    makeProbability: percentage.makeProbability,
    makePercent: percentage.makePercent,
    guaranteed: percentage.guaranteed,
    rim,
    hud: percentage.hud,
    event: Object.freeze({
      type: made ? "SHOT_MADE_RESULT" : "SHOT_MISS_RESULT",
      made,
      makeProbability: percentage.makeProbability,
      coverage: percentage.coverage,
      coverageLabel: percentage.coverageLabel,
      releaseQuality: percentage.releaseQuality,
      rangeLabel: percentage.rangeLabel,
      rimResult: rim.result,
      swish: rim.swish,
    }),
  });
}
