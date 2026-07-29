import test from "node:test";
import assert from "node:assert/strict";
import {
  QUICK_SHOT_QA_SPOTS,
  runQuickShootingQA,
} from "../js/shooting-quick-qa.js";

test("20-spot quick QA covers unique court positions, meter widths, and contests", () => {
  assert.equal(QUICK_SHOT_QA_SPOTS.length, 20);
  assert.equal(
    new Set(QUICK_SHOT_QA_SPOTS.map(
      (spot) => `${spot.position.x},${spot.position.z}`,
    )).size,
    20,
  );
  assert.equal(new Set(QUICK_SHOT_QA_SPOTS.map((spot) => spot.assist)).size, 4);
  assert.equal(
    new Set(QUICK_SHOT_QA_SPOTS.map((spot) => spot.meterCharge.toFixed(5))).size
      > 5,
    true,
  );
  assert.equal(
    QUICK_SHOT_QA_SPOTS.some((spot) => spot.coverage.blockWindow > 0),
    true,
  );
});

test("every visible green is a guaranteed make through production resolution and ballistics", () => {
  const report = runQuickShootingQA();
  assert.deepEqual(report.summary, {
    total: 20,
    passed: 20,
    failed: 0,
    allGreenAutoMakes: true,
    cleanSwishes: 10,
    softRimIns: 10,
    jumpingContests: 10,
  });
  for (const row of report.rows) {
    assert.equal(row.meter.perfect, true, `${row.id} meter was not green`);
    assert.equal(row.attempt.guaranteed, true, `${row.id} was not guaranteed`);
    assert.equal(row.attempt.made, true, `${row.id} missed`);
    assert.equal(row.crossing.corrected, true, `${row.id} lacked hoop correction`);
  }
});
