import {
  SHOT_METER_IDEAL,
  resolveShotAttempt,
  resolveShotMeterWindow,
} from "./shot-coverage.js";
import {
  shootingAssistDisplay,
  userShotPerfectHalfWidth,
} from "./shooting-assist.js";
import { resolveGuaranteedHoopCrossing } from "./shot-guarantee.js";

const RIM = Object.freeze({ x: 0, y: 3.05, z: -5.7 });
const RELEASE_OFFSETS = Object.freeze([-0.96, -0.48, 0, 0.48, 0.96]);
const ASSIST_LEVELS = Object.freeze([0, 0.5, 0.75, 1]);
const COVERAGES = Object.freeze([
  Object.freeze({ id: "wide-open", coverage: 0.02, blockWindow: 0 }),
  Object.freeze({ id: "grounded", coverage: 0.28, blockWindow: 0 }),
  Object.freeze({ id: "jump-window", coverage: 0.5, blockWindow: 0.34 }),
  Object.freeze({ id: "smothered", coverage: 0.78, blockWindow: 0.42 }),
]);

const SPOTS = Object.freeze([
  [-5.6, -4.7, "LEFT CORNER"],
  [-5.25, -3.0, "LEFT WING LOW"],
  [-4.8, -1.35, "LEFT WING"],
  [-4.1, 0.15, "LEFT SLOT"],
  [-3.1, 1.15, "LEFT ARC"],
  [-1.65, 1.65, "LEFT TOP"],
  [0, 1.85, "TOP KEY"],
  [1.65, 1.65, "RIGHT TOP"],
  [3.1, 1.15, "RIGHT ARC"],
  [4.1, 0.15, "RIGHT SLOT"],
  [4.8, -1.35, "RIGHT WING"],
  [5.25, -3.0, "RIGHT WING LOW"],
  [5.6, -4.7, "RIGHT CORNER"],
  [3.75, -3.35, "RIGHT ELBOW EXT"],
  [2.55, -2.25, "RIGHT ELBOW"],
  [1.25, -3.05, "RIGHT LANE"],
  [0, -3.75, "FREE THROW LINE"],
  [-1.25, -3.05, "LEFT LANE"],
  [-2.55, -2.25, "LEFT ELBOW"],
  [-3.75, -3.35, "LEFT ELBOW EXT"],
]);

export const QUICK_SHOT_QA_SPOTS = Object.freeze(SPOTS.map(
  ([x, z, label], index) => {
    const assist = ASSIST_LEVELS[index % ASSIST_LEVELS.length];
    const halfWidth = userShotPerfectHalfWidth(assist);
    const meterCharge = SHOT_METER_IDEAL
      + halfWidth * RELEASE_OFFSETS[index % RELEASE_OFFSETS.length];
    return Object.freeze({
      id: `QA-${String(index + 1).padStart(2, "0")}`,
      label,
      position: Object.freeze({ x, y: 0, z }),
      assist,
      meterCharge,
      coverage: COVERAGES[index % COVERAGES.length],
    });
  },
));

function runSpot(spot, index) {
  const halfWidth = userShotPerfectHalfWidth(spot.assist);
  const meter = resolveShotMeterWindow(
    spot.meterCharge,
    SHOT_METER_IDEAL,
    halfWidth,
  );
  const coverageResult = Object.freeze({
    coverage: spot.coverage.coverage,
    defenders: spot.coverage.coverage < 0.08
      ? Object.freeze([])
      : Object.freeze([Object.freeze({
        id: `qa-defender-${index + 1}`,
        coverage: spot.coverage.coverage,
        breakdown: Object.freeze({
          blockWindow: spot.coverage.blockWindow,
        }),
      })]),
  });
  const distance = Math.hypot(
    spot.position.x - RIM.x,
    spot.position.z - RIM.z,
  );
  const attempt = resolveShotAttempt({
    coverageResult,
    perfectRelease: meter.perfect,
    releaseQuality: meter.perfect ? 1 : 0.8,
    distance,
    shooterPosition: spot.position,
    rimPosition: RIM,
    ratings: { closeShot: 74, midRange: 74, threePoint: 74 },
    stamina: 0.68 + (index % 4) * 0.08,
    difficulty: index % 2 ? "legend" : "rookie",
    userControlled: true,
    outcomeValue: 0.999999,
    rimValue: index % 2 ? 0.97 : 0.08,
  });
  const crossing = resolveGuaranteedHoopCrossing({
    state: "shot",
    guaranteedMake: attempt.guaranteed,
    bankShot: false,
    plannedRimResult: attempt.rim.result,
    velocityY: -3.2,
    previousY: RIM.y + 0.08,
    currentY: RIM.y - 0.01,
    currentX: spot.position.x * 0.04,
    basketX: RIM.x,
    basketY: RIM.y,
    basketZ: RIM.z,
  });
  const passed = meter.perfect
    && attempt.guaranteed
    && attempt.made
    && attempt.makeProbability === 1
    && crossing.corrected;
  return Object.freeze({
    ...spot,
    halfWidth,
    assistLabel: shootingAssistDisplay(spot.assist).label,
    meter,
    distance,
    attempt,
    crossing,
    passed,
  });
}

export function runQuickShootingQA() {
  const rows = Object.freeze(QUICK_SHOT_QA_SPOTS.map(runSpot));
  const passed = rows.filter((row) => row.passed).length;
  return Object.freeze({
    rows,
    summary: Object.freeze({
      total: rows.length,
      passed,
      failed: rows.length - passed,
      allGreenAutoMakes: passed === rows.length,
      cleanSwishes: rows.filter((row) => row.attempt.rim.swish).length,
      softRimIns: rows.filter((row) => !row.attempt.rim.swish).length,
      jumpingContests: rows.filter(
        (row) => row.coverage.blockWindow > 0,
      ).length,
    }),
  });
}
