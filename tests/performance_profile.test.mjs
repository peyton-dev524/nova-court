import nodeTest from "node:test";
import assert from "node:assert/strict";
import { collectContractScenarios } from "./helpers/contract-scenarios.mjs";

import {
  QUALITY_PRESETS,
  analyzeFrameTimes,
  calculateFootGroundCorrection,
  calculatePoolReusePlan,
  dampFootGroundCorrection,
  planFixedSteps,
  recommendPoolCapacity,
  recommendQualityTier,
  resolveQualitySettings,
} from "../js/performance-profile.js";

const { scenario: test, register } = collectContractScenarios();

test("frame analysis reports 60 FPS budget and ignores invalid samples", () => {
  const samples = [16, 17, 15, Number.NaN, -5, 20];
  const stats = analyzeFrameTimes(samples, 60);
  assert.equal(stats.sampleCount, 4);
  assert.ok(Math.abs(stats.frameBudgetMs - 16.6667) < 0.001);
  assert.ok(Math.abs(stats.averageMs - 17) < 1e-9);
  assert.equal(stats.worstMs, 20);
  assert.ok(stats.effectiveFps > 58 && stats.effectiveFps < 59);
  assert.deepEqual(samples, [16, 17, 15, Number.NaN, -5, 20]);
});

test("quality governor moves only one tier and uses hysteresis", () => {
  const slowFrames = Array.from({ length: 120 }, (_, index) => index % 4 === 0 ? 31 : 19);
  const downgrade = recommendQualityTier(slowFrames, "quality");
  assert.equal(downgrade.tier, "balanced");
  assert.equal(downgrade.direction, "down");

  const fastFrames = Array.from({ length: 120 }, () => 10);
  const upgrade = recommendQualityTier(fastFrames, "balanced");
  assert.equal(upgrade.tier, "quality");
  assert.equal(upgrade.direction, "up");

  const cooldown = recommendQualityTier(slowFrames, "quality", { cooldownReady: false });
  assert.equal(cooldown.tier, "quality");
  assert.equal(cooldown.reason, "cooldown");
});

test("resolved performance quality caps pixel ratio and expensive features", () => {
  const resolved = resolveQualitySettings("performance", 2.5);
  assert.equal(resolved.pixelRatio, 1);
  assert.equal(resolved.shadows, false);
  assert.equal(resolved.crowdDensity, QUALITY_PRESETS.performance.crowdDensity);
  assert.equal(resolveQualitySettings("unknown", 2).tier, "balanced");
});

test("fixed-step planner caps catch-up work and drops complete excess steps", () => {
  const plan = planFixedSteps(0, 0.05, {
    fixedStep: 1 / 120,
    maxFrameDelta: 0.05,
    maxSubSteps: 4,
  });
  assert.equal(plan.requestedSteps, 6);
  assert.equal(plan.steps, 4);
  assert.equal(plan.droppedSteps, 2);
  assert.ok(Math.abs(plan.droppedTime - 1 / 60) < 1e-9);
  assert.equal(plan.saturated, true);
  assert.ok(plan.nextAccumulator >= 0 && plan.nextAccumulator < plan.fixedStep);
});

test("fixed-step planner preserves fractional time for interpolation", () => {
  const plan = planFixedSteps(0, 1 / 144, {
    fixedStep: 1 / 120,
    maxSubSteps: 4,
  });
  assert.equal(plan.steps, 0);
  assert.ok(Math.abs(plan.nextAccumulator - 1 / 144) < 1e-9);
  assert.ok(plan.interpolationAlpha > 0 && plan.interpolationAlpha < 1);
});

test("pool capacity accounts for concurrency, burst reserve, and headroom", () => {
  assert.equal(recommendPoolCapacity({
    peakSpawnPerSecond: 30,
    maxLifetimeSeconds: 0.6,
    burstReserve: 24,
    headroom: 1.25,
  }), 53);
});

test("pool reuse plan admits only free slots and never requests allocation", () => {
  const plan = calculatePoolReusePlan({
    capacity: 52,
    activeCount: 49,
    requestedCount: 14,
  });
  assert.equal(plan.admittedCount, 3);
  assert.equal(plan.droppedCount, 11);
  assert.equal(plan.shouldAllocate, false);
  assert.equal(plan.saturated, true);
  assert.ok(plan.cosmeticScale < 0.3);
});

test("foot correction resolves the current neutral-pose sole penetration", () => {
  // Current rig: 0.9 hips - 0.05 hip - 0.575 knee - 0.603 outsole
  // - 0.0175 outsole half-height = -0.3455 world units at height scale 1.
  const correction = calculateFootGroundCorrection({
    rootY: 0,
    floorY: 0,
    footBottoms: [-0.3455, -0.3455],
    soleClearance: 0.006,
  });
  assert.ok(Math.abs(correction.penetration - 0.3455) < 1e-9);
  assert.ok(Math.abs(correction.correctionY - 0.3515) < 1e-9);
  assert.ok(Math.abs(correction.correctedRootY - 0.3515) < 1e-9);
});

test("foot correction is disabled in the air and clamps malformed rigs", () => {
  const airborne = calculateFootGroundCorrection({
    rootY: 1.2,
    footBottoms: [0.8, 0.9],
    grounded: false,
  });
  assert.equal(airborne.correctionY, 0);
  assert.equal(airborne.correctedRootY, 1.2);

  const malformed = calculateFootGroundCorrection({
    footBottoms: [-2],
    maxRise: 0.4,
  });
  assert.equal(malformed.correctionY, 0.4);
  assert.equal(malformed.clamped, true);
});

test("foot correction damping is frame-rate independent and releases more softly", () => {
  const oneFrame = dampFootGroundCorrection(0, 0.35, 1 / 30);
  const twoFrames = dampFootGroundCorrection(
    dampFootGroundCorrection(0, 0.35, 1 / 60),
    0.35,
    1 / 60,
  );
  assert.ok(Math.abs(oneFrame - twoFrames) < 1e-12);

  const rise = dampFootGroundCorrection(0, 0.35, 1 / 60);
  const release = dampFootGroundCorrection(0.35, 0, 1 / 60);
  assert.ok(rise > 0.35 - release);
});

register(nodeTest, "frame budget, quality, pooling, and foot-correction contracts");
