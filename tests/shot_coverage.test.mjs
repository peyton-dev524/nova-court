import test from "node:test";
import assert from "node:assert/strict";
import {
  COVERAGE_LABELS,
  RIM_RESULTS,
  calculateDefenderCoverage,
  calculateShotCoverage,
  calculateShotMakePercentage,
  isShotMeterPerfect,
  resolveShotAttempt,
  scoreReleaseTiming,
  shotFacingDirection,
  selectRimResult,
} from "../js/shot-coverage.js";

test("defender coverage reacts to distance, angle, timing, height, and block window", () => {
  const base = {
    shooterPosition: { x: 0, y: 0, z: 2 },
    rimPosition: { x: 0, y: 3.05, z: -5.7 },
    releaseHeight: 2.25,
  };
  const lateSide = calculateDefenderCoverage({
    ...base,
    defender: {
      id: "late",
      position: { x: 2, y: 0, z: 2 },
      height: 1.8,
      contestTiming: 0.65,
      blockWindow: 0,
    },
  });
  const liveFront = calculateDefenderCoverage({
    ...base,
    defender: {
      id: "live",
      position: { x: 0, y: 0, z: 1.25 },
      height: 2.08,
      vertical: 0.9,
      contestTiming: 0.03,
      blockWindow: 0.38,
      handPosition: { x: 0, y: 2.32, z: 1.8 },
      isContesting: true,
    },
  });
  assert.ok(liveFront.coverage > lateSide.coverage + 0.5);
  assert.ok(liveFront.breakdown.blockWindow > 0.8);
  assert.ok(liveFront.breakdown.releaseAdvantage > lateSide.breakdown.releaseAdvantage);
});

test("multiple defenders combine with diminishing overlap", () => {
  const defender = {
    position: { x: 0, y: 0, z: 1.2 },
    contestTiming: 0.08,
    height: 1.95,
    isContesting: true,
  };
  const one = calculateShotCoverage({
    shooterPosition: { x: 0, z: 2 },
    defenders: [{ id: "a", ...defender }],
  });
  const two = calculateShotCoverage({
    shooterPosition: { x: 0, z: 2 },
    defenders: [
      { id: "a", ...defender },
      { id: "b", ...defender, position: { x: 0.25, z: 1.25 } },
    ],
  });
  assert.ok(two.coverage > one.coverage);
  assert.ok(two.coverage < one.coverage * 2);
  assert.equal(two.primaryDefenderId, "a");
});

test("coverage exposes stable percent and readable HUD labels", () => {
  const result = calculateShotCoverage({
    shooterPosition: { x: 0, z: 2 },
    defenders: [],
  });
  assert.equal(result.coverage, 0);
  assert.equal(result.percent, 0);
  assert.equal(result.label, COVERAGE_LABELS.WIDE_OPEN);
  assert.equal(result.hud.coverageLabel, "WIDE OPEN");
  assert.equal(result.hud.coveragePercent, "0% COVERED");
});

test("wide-open perfect release is guaranteed", () => {
  const result = calculateShotMakePercentage({
    coverage: 0.02,
    perfectRelease: true,
    distance: 7,
    ratings: { threePoint: 0.55 },
    stamina: 0.4,
    difficulty: "legend",
  });
  assert.equal(result.guaranteed, true);
  assert.equal(result.makeProbability, 1);
  assert.equal(result.makePercent, 100);
});

test("a perfect release is not guaranteed through meaningful coverage", () => {
  const result = calculateShotMakePercentage({
    coverage: 0.55,
    perfectRelease: true,
    distance: 6.4,
    ratings: { threePoint: 0.8 },
    stamina: 0.9,
  });
  assert.equal(result.guaranteed, false);
  assert.ok(result.makeProbability < 0.8);
  assert.ok(result.makeProbability > 0.1);
});


test("the green meter window is the only perfect timing window", () => {
  assert.equal(isShotMeterPerfect(0.72), true);
  assert.equal(isShotMeterPerfect(0.684), true);
  assert.equal(isShotMeterPerfect(0.756), true);
  assert.equal(isShotMeterPerfect(0.67), false);
  assert.equal(isShotMeterPerfect(0.78), false);
});

test("shot facing always points from the shooter to the active rim", () => {
  const direction = shotFacingDirection(
    { x: 2, z: -1 },
    { x: -1, z: 5 },
  );
  assert.ok(direction.x < 0);
  assert.ok(direction.z > 0);
  assert.ok(Math.abs(Math.hypot(direction.x, direction.z) - 1) < 1e-9);
});

test("heavy coverage sharply lowers a shot without trivially zeroing it", () => {
  const open = calculateShotMakePercentage({
    coverage: 0.05,
    releaseQuality: 0.82,
    distance: 5,
    ratings: { midRange: 0.72 },
    stamina: 0.8,
  });
  const smothered = calculateShotMakePercentage({
    coverage: 0.95,
    releaseQuality: 0.82,
    distance: 5,
    ratings: { midRange: 0.72 },
    stamina: 0.8,
  });
  assert.ok(smothered.makeProbability < open.makeProbability - 0.35);
  assert.ok(smothered.makeProbability >= 0.025);
});

test("ratings, timing, stamina, range, and difficulty all affect make chance", () => {
  const strong = calculateShotMakePercentage({
    coverage: 0.2,
    releaseQuality: 0.92,
    distance: 5,
    ratings: { midRange: 0.9 },
    stamina: 1,
    difficulty: "rookie",
  });
  const weak = calculateShotMakePercentage({
    coverage: 0.2,
    releaseQuality: 0.45,
    distance: 8.5,
    ratings: { threePoint: 0.4 },
    stamina: 0.2,
    difficulty: "legend",
  });
  assert.ok(strong.makeProbability > weak.makeProbability + 0.45);
  assert.notEqual(strong.rangeLabel, weak.rangeLabel);
  assert.equal(strong.hud.makePercent, `${strong.makePercent}%`);
});

test("release timing may be supplied as quality or temporal error", () => {
  const exact = scoreReleaseTiming({ perfectRelease: true, releaseErrorSeconds: 2 });
  const near = scoreReleaseTiming({ releaseErrorSeconds: 0.04 });
  const late = scoreReleaseTiming({ releaseErrorSeconds: 0.5 });
  assert.equal(exact.quality, 1);
  assert.ok(near.quality > late.quality);
  assert.equal(late.label, "poor");
});

test("made shots can be swishes, soft rim makes, or banks", () => {
  const swish = selectRimResult({
    made: true,
    releaseQuality: 1,
    makeProbability: 1,
    rimValue: 0.2,
  });
  const soft = selectRimResult({
    made: true,
    releaseQuality: 0.72,
    makeProbability: 0.7,
    rimValue: 0.98,
  });
  const bank = selectRimResult({
    made: true,
    bankIntent: 1,
    bankAngleQuality: 1,
    rimValue: 0.1,
  });
  assert.equal(swish.result, RIM_RESULTS.CLEAN_SWISH);
  assert.equal(soft.result, RIM_RESULTS.SOFT_RIM_IN);
  assert.equal(bank.result, RIM_RESULTS.BANK);
  assert.equal(bank.backboardContacts, 1);
});

test("misses produce a live rim-out or a bank miss", () => {
  const rimOut = selectRimResult({ made: false, rimValue: 0.9 });
  const bankMiss = selectRimResult({
    made: false,
    bankIntent: 1,
    bankAngleQuality: 1,
    rimValue: 0.1,
  });
  assert.equal(rimOut.result, RIM_RESULTS.RIM_OUT);
  assert.ok(rimOut.rimContacts >= 1);
  assert.equal(bankMiss.result, RIM_RESULTS.BANK);
  assert.equal(bankMiss.bankMade, false);
});

test("guaranteed make does not force a swish", () => {
  const result = resolveShotAttempt({
    coverage: 0,
    perfectRelease: true,
    distance: 6.5,
    ratings: { threePoint: 0.6 },
    outcomeValue: 0.999,
    rimValue: 0.99,
  });
  assert.equal(result.made, true);
  assert.equal(result.guaranteed, true);
  assert.equal(result.rim.result, RIM_RESULTS.SOFT_RIM_IN);
  assert.equal(result.rim.swish, false);
});

test("explicit outcome values make shot resolution replay deterministic", () => {
  const input = {
    coverage: 0.35,
    releaseQuality: 0.72,
    distance: 6.4,
    ratings: { threePoint: 0.7 },
    outcomeValue: 0.42,
    rimValue: 0.73,
  };
  assert.deepEqual(resolveShotAttempt(input), resolveShotAttempt(input));
});
