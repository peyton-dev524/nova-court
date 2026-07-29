import nodeTest from "node:test";
import assert from "node:assert/strict";
import { collectContractScenarios } from "./helpers/contract-scenarios.mjs";
import { RIM_RESULTS } from "../js/shot-coverage.js";
import { resolveGuaranteedHoopCrossing } from "../js/shot-guarantee.js";

const { scenario: test, register } = collectContractScenarios();

test("clean and soft-rim guaranteed makes both cross safely inside the hoop", () => {
  for (const plannedRimResult of [
    RIM_RESULTS.CLEAN_SWISH,
    RIM_RESULTS.SOFT_RIM_IN,
  ]) {
    const result = resolveGuaranteedHoopCrossing({
      state: "shot",
      guaranteedMake: true,
      plannedRimResult,
      velocityY: -3.2,
      previousY: 3.1,
      currentY: 3.04,
      currentX: -0.4,
      basketX: 0,
      basketY: 3.05,
      basketZ: -5.7,
    });
    assert.equal(result.corrected, true);
    assert.ok(Math.abs(result.position.x) < 0.2);
    assert.equal(result.position.y, 3.03);
    assert.equal(result.position.z, -5.7);
    assert.equal(
      result.minimumRimContacts,
      plannedRimResult === RIM_RESULTS.SOFT_RIM_IN ? 1 : 0,
    );
  }
});

test("blocks, banks, non-guaranteed shots, and rising shots are never corrected", () => {
  const base = {
    state: "shot",
    guaranteedMake: true,
    bankShot: false,
    plannedRimResult: RIM_RESULTS.CLEAN_SWISH,
    velocityY: -2,
    previousY: 3.08,
    currentY: 3.02,
    currentX: 0.3,
    basketX: 0,
    basketY: 3.05,
    basketZ: -5.7,
  };
  for (const override of [
    { state: "blocked" },
    { bankShot: true },
    { guaranteedMake: false },
    { velocityY: 1 },
    { previousY: 2.9 },
  ]) {
    assert.equal(
      resolveGuaranteedHoopCrossing({ ...base, ...override }).corrected,
      false,
    );
  }
});

register(nodeTest, "guaranteed shot ballistics contract");
