import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyGameplayHudVisibility,
  gameplayHudVisibilityForMode,
} from "../js/gameplay-hud-visibility.js";
import {
  CENTER_LOGO_HALF_EXTENT_METERS,
  calculateCourtWideCamera,
  calculateOpenGymQACamera,
  resolveCourtBrandingPlacement,
} from "../js/court-branding.js";
import { COURT_SPECS } from "../js/team-formats.js";

function fakeNode() {
  const classes = new Set();
  return {
    hidden: false,
    dataset: {},
    attributes: new Map(),
    classList: {
      toggle(name, active) {
        if (active) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  };
}

function fakeHudDocument() {
  const selectors = new Map([
    ["#app", fakeNode()],
    [".scoreboard", fakeNode()],
    ["#broadcast-bug", fakeNode()],
    ["#player-card-hud", fakeNode()],
    ["#takeover", fakeNode()],
    ["#control-hints", fakeNode()],
  ]);
  return {
    selectors,
    querySelector(selector) {
      return selectors.get(selector) || null;
    },
  };
}

test("Open Gym hides persistent broadcast and stat chrome but keeps play-critical feedback", () => {
  const contract = gameplayHudVisibilityForMode("practice");
  assert.deepEqual(
    {
      scoreboard: contract.scoreboard,
      broadcastBug: contract.broadcastBug,
      playerCard: contract.playerCard,
      momentum: contract.momentum,
      controlHints: contract.controlHints,
    },
    {
      scoreboard: false,
      broadcastBug: false,
      playerCard: false,
      momentum: false,
      controlHints: false,
    },
  );
  assert.equal(contract.pause, true);
  assert.equal(contract.stamina, true);
  assert.equal(contract.shotMeter, true);
  assert.equal(contract.transientFeedback, true);
});

test("Open Gym DOM state is explicit, reversible, and scoped away from competitive modes", () => {
  const doc = fakeHudDocument();
  applyGameplayHudVisibility(doc, "practice");
  for (const selector of [".scoreboard", "#broadcast-bug", "#player-card-hud", "#takeover", "#control-hints"]) {
    const node = doc.selectors.get(selector);
    assert.equal(node.hidden, true, selector);
    assert.equal(node.classList.contains("is-hidden"), true, selector);
    assert.equal(node.attributes.get("aria-hidden"), "true", selector);
  }
  assert.equal(doc.selectors.get("#app").dataset.gameMode, "practice");

  applyGameplayHudVisibility(doc, "street");
  for (const selector of [".scoreboard", "#player-card-hud", "#takeover"]) {
    const node = doc.selectors.get(selector);
    assert.equal(node.hidden, false, selector);
    assert.equal(node.classList.contains("is-hidden"), false, selector);
    assert.equal(node.attributes.get("aria-hidden"), "false", selector);
  }
  for (const selector of ["#broadcast-bug", "#control-hints"]) {
    const node = doc.selectors.get(selector);
    assert.equal(node.hidden, true, selector);
    assert.equal(node.classList.contains("is-hidden"), true, selector);
    assert.equal(node.attributes.get("aria-hidden"), "true", selector);
  }
  assert.equal(doc.selectors.get("#app").dataset.gameMode, "street");
});

test("half-court branding is removed because authentic midcourt is its open boundary", () => {
  const placement = resolveCourtBrandingPlacement(COURT_SPECS.half);
  assert.equal(placement.visible, false);
  assert.equal(placement.centerLineZ, COURT_SPECS.half.halfLength);
  assert.equal(placement.z, 7);
  assert.equal(placement.logoHalfExtent, CENTER_LOGO_HALF_EXTENT_METERS);
  assert.ok(placement.z + placement.logoHalfExtent > COURT_SPECS.half.halfLength);
  assert.equal(placement.reason, "half-court-center-is-open-boundary");
});

test("full-court branding uses the true origin where the midcourt line and circle cross", () => {
  const placement = resolveCourtBrandingPlacement(COURT_SPECS.full);
  assert.equal(placement.visible, true);
  assert.deepEqual([placement.x, placement.z, placement.centerLineZ], [0, 0, 0]);
  assert.equal(placement.reason, "full-court-origin-is-midcourt");
});

test("court-wide QA camera derives enough height from court extents, aspect, and FOV", () => {
  const camera = calculateCourtWideCamera(COURT_SPECS.half, 16 / 9, 50);
  const tangent = Math.tan((camera.fov * Math.PI / 180) / 2);
  const visibleHalfLength = camera.height * tangent;
  const visibleHalfWidth = visibleHalfLength * (16 / 9);
  assert.ok(visibleHalfLength >= COURT_SPECS.half.halfLength + camera.padding);
  assert.ok(visibleHalfWidth >= COURT_SPECS.half.halfWidth + camera.padding);
  assert.deepEqual(camera.target, [0, 0, 0]);
  assert.deepEqual(camera.up, [0, 0, -1]);
});

test("Open Gym proof camera remains inside the half-court venue envelope", () => {
  const camera = calculateOpenGymQACamera(COURT_SPECS.half);
  assert.ok(Math.abs(camera.position[0]) < COURT_SPECS.half.halfWidth);
  assert.ok(Math.abs(camera.position[2]) < COURT_SPECS.half.halfLength);
  assert.ok(camera.position[1] > 3.5);
  assert.ok(camera.target[2] < 0, "target points toward the attacking basket");
});

test("app applies the visibility contract and captures Open Gym through the production venue", async () => {
  const app = await readFile(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /applyGameplayHudVisibility\(document, currentModeKey\)/);
  assert.match(app, /gameplayHudCapture/);
  assert.match(
    app,
    /if \(modeKey === "practice"\) engine\.snapOpenGymCameraForQA\?\.\(\)/,
  );
  assert.match(app, /snapCourtWideCameraForQA/);
  assert.doesNotMatch(app, /loadVenueDetails|baseCourtOnly|openGymCapture/);
});
