import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BASKETBALL_JERSEY_PART_NAMES,
  JERSEY_REFERENCE_DIMENSIONS,
  REMOVED_JERSEY_ARTIFACT_PART_NAMES,
  estimateBasketballJerseyCost,
  jerseyCrossSection,
  normalizeBasketballJerseyParameters,
  sampleJerseyClearance,
  stepJerseySpring,
} from "../js/basketball-jersey.js";
import {
  PROFILE_SCHEMA_VERSION,
  createDefaultProfile,
  getEnginePlayerConfig,
  normalizeProfile,
  updatePlayerIdentity,
} from "../js/player-progression.js";

const root = new URL("../", import.meta.url);

test("jersey reconstruction keeps the supplied and rules-derived dimensions in meters", () => {
  assert.equal(JERSEY_REFERENCE_DIMENSIONS.bodyWidthM, 19 * 0.0254);
  assert.equal(JERSEY_REFERENCE_DIMENSIONS.bodyLengthM, 29.75 * 0.0254);
  assert.deepEqual(JERSEY_REFERENCE_DIMENSIONS.tallLengthOptionsM, [2 * 0.0254, 4 * 0.0254]);
  assert.equal(JERSEY_REFERENCE_DIMENSIONS.frontNumberMinM, 4 * 0.0254);
  assert.equal(JERSEY_REFERENCE_DIMENSIONS.backNumberMinM, 6 * 0.0254);
  assert.equal(JERSEY_REFERENCE_DIMENSIONS.armholeTrimMaxM, 0.0254);
  assert.equal(JERSEY_REFERENCE_DIMENSIONS.sidePanelMaxM, 4 * 0.0254);
});

test("jersey fit controls clamp unsafe cloth dimensions deterministically", () => {
  const parameters = normalizeBasketballJerseyParameters({
    fit: 4,
    length: 0.2,
    hemFlare: -1,
    sidePanelWidth: 1,
    fabricResponse: 9,
  });
  assert.deepEqual(parameters, {
    fit: 1.14,
    length: 0.69,
    hemFlare: 0.012,
    sidePanelWidth: 0.1016,
    fabricResponse: 1,
  });
});

test("shoulder anchors stay high while the lower shell remains loose and collision-safe", () => {
  const parameters = normalizeBasketballJerseyParameters();
  const shoulder = jerseyCrossSection(1, 0, parameters);
  const frontNeck = jerseyCrossSection(1, Math.PI / 2, parameters);
  const hem = jerseyCrossSection(0, Math.PI / 2, parameters);
  const waist = jerseyCrossSection(0.34, Math.PI / 2, parameters);
  const sideHem = jerseyCrossSection(0, 0, parameters);
  assert.ok(shoulder.topY - frontNeck.topY > 0.13);
  assert.equal(sideHem.bottomY, hem.bottomY);
  assert.ok(hem.radiusX > waist.radiusX);
  assert.deepEqual(sampleJerseyClearance(parameters).passes, true);
  assert.ok(sampleJerseyClearance(parameters).minimumM >= 0.008);
});

test("jersey fabric spring is bounded under pathological motion inputs", () => {
  let state = { position: 0, velocity: 0 };
  for (let frame = 0; frame < 600; frame += 1) {
    state = stepJerseySpring(state, frame % 2 ? 100 : -100, 1, 1);
    assert.ok(Math.abs(state.position) <= 0.042);
    assert.ok(Math.abs(state.velocity) <= 0.55);
  }
});

test("strict per-player jersey budget stays below the authored runtime ceiling", () => {
  const cost = estimateBasketballJerseyCost();
  assert.deepEqual(cost, {
    drawCalls: 1,
    shellTriangles: 432,
    bindingTriangles: 0,
    totalTriangles: 432,
    dynamicVertices: 240,
    collisionTestsPerFrame: 240,
    textures: 0,
    maxDynamicOffsetM: 0.042,
  });
  assert.ok(cost.drawCalls <= 1);
  assert.ok(cost.totalTriangles <= 450);
});

test("shared jersey manifest contains only the cloth shell and excludes cord-like overlays", async () => {
  assert.deepEqual(BASKETBALL_JERSEY_PART_NAMES, ["dimensioned-loose-jersey-shell"]);
  assert.deepEqual(REMOVED_JERSEY_ARTIFACT_PART_NAMES, [
    "front-v-neck-binding",
    "back-neck-binding",
    "left-armhole-binding",
    "right-armhole-binding",
  ]);
  assert.equal(
    BASKETBALL_JERSEY_PART_NAMES.some((name) =>
      REMOVED_JERSEY_ARTIFACT_PART_NAMES.includes(name)),
    false,
  );

  const source = await readFile(new URL("js/basketball-jersey.js", root), "utf8");
  assert.doesNotMatch(source, /new T\.TubeGeometry/);
  assert.match(source, /const bindings = Object\.freeze\(\[\]\)/);
  assert.match(source, /root\.userData\.namedParts = BASKETBALL_JERSEY_PART_NAMES/);
});

test("production, My Player preview, and Player Model Lab all consume the same corrected rig", async () => {
  const [engine, app, lab] = await Promise.all([
    readFile(new URL("js/engine.js", root), "utf8"),
    readFile(new URL("js/app.js", root), "utf8"),
    readFile(new URL("js/player-model-lab.js", root), "utf8"),
  ]);
  assert.match(engine, /createBasketballJerseyRig\(T,/);
  assert.match(app, /new ProceduralPlayer\(onboardingPreview\.engine/);
  assert.match(lab, /new ProceduralPlayer\(harnessEngine,/);
  assert.doesNotMatch(engine, /front-v-neck-binding|back-neck-binding|armhole-binding/);
  assert.doesNotMatch(app, /front-v-neck-binding|back-neck-binding|armhole-binding/);
  assert.doesNotMatch(lab, /front-v-neck-binding|back-neck-binding|armhole-binding/);
});

test("current profile migration persists jersey fit and reaches production player config", () => {
  assert.equal(PROFILE_SCHEMA_VERSION, 7);
  const legacy = normalizeProfile({
    version: 5,
    identity: { created: true, displayName: "Legacy Ace", jerseyStyle: { fit: 9 } },
  });
  assert.equal(legacy.identity.jerseyStyle.fit, 1.14);
  const updated = updatePlayerIdentity(createDefaultProfile(), {
    displayName: "Cloth Guard",
    jerseyStyle: { fit: 0.98, length: 0.82, hemFlare: 0.05, sidePanelWidth: 0.09, fabricResponse: 0.75 },
  });
  assert.equal(updated.ok, true);
  assert.equal(getEnginePlayerConfig(updated.profile).jerseyStyle.length, 0.82);
});

test("four-step creation wizard is distinct, keyboard reachable, and keeps a live appearance preview", async () => {
  const [html, app, styles] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("js/app.js", root), "utf8"),
    readFile(new URL("styles.css", root), "utf8"),
  ]);
  for (const step of ["identity", "appearance", "attributes", "review"]) {
    assert.match(html, new RegExp(`data-wizard-step="${step}"`));
  }
  assert.match(html, /aria-current="step"/);
  assert.match(html, /aria-label="Live 3D player appearance preview"/);
  assert.match(html, /<fieldset class="wizard-panel/);
  assert.match(html, /<legend>Review &amp; Save<\/legend>/);
  assert.match(app, /function setOnboardingStep/);
  assert.match(app, /new ProceduralPlayer\(onboardingPreview\.engine/);
  assert.match(app, /rebuildOnboardingPreview/);
  assert.match(styles, /\.appearance-wizard-layout/);
  assert.match(styles, /@media \(max-width: 520px\)/);
});

test("Player Model Lab exposes named front, side, back, and action jersey captures", async () => {
  const [html, lab] = await Promise.all([
    readFile(new URL("player-lab.html", root), "utf8"),
    readFile(new URL("js/player-model-lab.js", root), "utf8"),
  ]);
  for (const view of ["jersey-front", "jersey-side", "jersey-back", "jersey-action"]) {
    assert.match(html, new RegExp(`data-view="${view}"`));
    assert.match(lab, new RegExp(`"${view}"`));
  }
  assert.match(lab, /setJerseyParameters/);
  assert.match(lab, /jerseyMetrics/);
  assert.match(lab, /jersey-action-cloth/);
});
