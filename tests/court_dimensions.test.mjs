import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  calculateCourtEndMarkings,
  calculateCourtMarkingLayout,
  createRegulationCourtSpec,
  FIBA_COURT,
} from "../js/court-dimensions.js";

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("court constants preserve the current FIBA metric dimensions", () => {
  assert.deepEqual({
    width: FIBA_COURT.width,
    length: FIBA_COURT.length,
    lineWidth: FIBA_COURT.lineWidth,
    arc: FIBA_COURT.threePointRadius,
    centreCircle: FIBA_COURT.centreCircleRadius,
    freeThrowCircle: FIBA_COURT.freeThrowCircleRadius,
    freeThrowLineFromEndline: FIBA_COURT.freeThrowLineFromEndline,
    restrictedAreaWidth: FIBA_COURT.restrictedAreaHalfWidth * 2,
  }, {
    width: 15,
    length: 28,
    lineWidth: 0.05,
    arc: 6.75,
    centreCircle: 1.8,
    freeThrowCircle: 1.8,
    freeThrowLineFromEndline: 5.8,
    restrictedAreaWidth: 4.9,
  });
});

test("basket and backboard offsets are measured from each endline", () => {
  const half = createRegulationCourtSpec("half");
  const full = createRegulationCourtSpec("full");
  close(half.baskets.home.z, -5.425);
  close(half.baskets.home.backboardZ, -5.8);
  close(full.halfLength - Math.abs(full.baskets.home.z), 1.575);
  close(full.halfLength - Math.abs(full.baskets.home.backboardZ), 1.2);
  close(full.baskets.away.z, 12.425);
});

test("half-court markings derive regulation free-throw and three-point joins", () => {
  const half = createRegulationCourtSpec("half");
  const end = calculateCourtEndMarkings(half, half.baskets.home);
  close(end.baselineZ, -7);
  close(end.freeThrowZ, -1.2);
  close(end.cornerX, 6.6);
  close(end.arcInwardOffset, Math.sqrt(6.75 ** 2 - 6.6 ** 2));
  close(end.threePointJoinZ, half.baskets.home.z + end.arcInwardOffset);
  assert.ok(end.threePointJoinZ > half.baskets.home.z);
});

test("full-court layout mirrors both ends around true centre court", () => {
  const full = createRegulationCourtSpec("full");
  const layout = calculateCourtMarkingLayout(full);
  assert.equal(layout.ends.length, 2);
  close(layout.ends[0].baselineZ, -layout.ends[1].baselineZ);
  close(layout.ends[0].freeThrowZ, -layout.ends[1].freeThrowZ);
  close(layout.ends[0].threePointJoinZ, -layout.ends[1].threePointJoinZ);
  assert.equal(layout.lineWidth, 0.05);
});

test("production app exposes a deterministic court-wide screenshot route", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /courtWideCapture/);
  assert.match(app, /snapCourtWideCameraForQA/);
  assert.match(app, /prepareCourtWideCaptureState/);
});
