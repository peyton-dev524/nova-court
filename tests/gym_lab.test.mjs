import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GYM_COURT,
  GYM_GROUP_IDS,
  GYM_QUALITY_BUDGETS,
  gymBudgetSnapshot,
} from "../js/gym-scene.js";

test("gym uses regulation high-school court and rim dimensions in meters", () => {
  assert.ok(Math.abs(GYM_COURT.length - 84 * 0.3048) < 1e-9);
  assert.ok(Math.abs(GYM_COURT.width - 50 * 0.3048) < 1e-9);
  assert.ok(Math.abs(GYM_COURT.rimHeight - 10 * 0.3048) < 1e-9);
  assert.ok(Math.abs(GYM_COURT.rimRadius - 0.4572 / 2) < 1e-9);
});

test("quality tiers are monotonically cheaper and high stays under scene budget", () => {
  for (const metric of ["calls", "triangles", "geometries", "textures"]) {
    assert.ok(GYM_QUALITY_BUDGETS.low[metric] <= GYM_QUALITY_BUDGETS.medium[metric]);
    assert.ok(GYM_QUALITY_BUDGETS.medium[metric] <= GYM_QUALITY_BUDGETS.high[metric]);
  }
  assert.deepEqual(gymBudgetSnapshot("high"), {
    quality: "high",
    ...GYM_QUALITY_BUDGETS.high,
    glbBytes: 0,
  });
  assert.ok(GYM_QUALITY_BUDGETS.high.calls <= 140);
  assert.ok(GYM_QUALITY_BUDGETS.high.triangles <= 55000);
  assert.ok(GYM_QUALITY_BUDGETS.high.geometries <= 220);
  assert.ok(GYM_QUALITY_BUDGETS.high.textures <= 12);
});

test("gym group contract includes required gameplay and optional detail IDs", () => {
  assert.deepEqual(GYM_GROUP_IDS, [
    "gym-shell",
    "gym-court",
    "gym-hoops",
    "gym-architecture",
    "gym-bleachers",
    "gym-signage",
    "gym-lighting",
  ]);
});

test("gym lab and app expose deterministic loading and renderer QA state", () => {
  const html = readFileSync(new URL("../gym-lab.html", import.meta.url), "utf8");
  const lab = readFileSync(new URL("../js/gym-lab.js", import.meta.url), "utf8");
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(html, /id="gym-loading"/);
  assert.match(html, /data-view="reference-baseline"/);
  assert.match(lab, /__NOVA_GYM_LAB__/);
  assert.match(lab, /renderInfo: metrics\(\)/);
  assert.match(lab, /releaseScene\("gym-lab", \{ dispose: true \}\)/);
  assert.match(app, /sceneLoading:/);
  assert.match(app, /updateSceneLoading\(currentModeKey, "required"/);
  assert.match(build, /gym-lab\.html/);
});
