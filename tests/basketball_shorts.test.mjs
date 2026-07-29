import test from "node:test";
import assert from "node:assert/strict";

import {
  BASKETBALL_SHORTS_DEFAULTS,
  constrainShortsVertexToCapsule,
  estimateBasketballShortsCost,
  normalizeBasketballShortsParameters,
  stepShortsSpring,
} from "../js/basketball-shorts.js";

test("long basketball shorts defaults stay within the authored fit range", () => {
  const parameters = normalizeBasketballShortsParameters();
  assert.deepEqual(parameters, BASKETBALL_SHORTS_DEFAULTS);
  assert.ok(parameters.length >= 0.44);
  assert.ok(parameters.flare >= 0.04);
  assert.ok(parameters.sideVent > 0);
});

test("shorts lab parameters clamp unsafe geometry and spring values", () => {
  const parameters = normalizeBasketballShortsParameters({
    length: 4,
    flare: -2,
    sideVent: 1,
    sway: -1,
    stiffness: 900,
    damping: 0,
  });
  assert.equal(parameters.length, 0.52);
  assert.equal(parameters.flare, 0.01);
  assert.equal(parameters.sideVent, 0.1);
  assert.equal(parameters.sway, 0);
  assert.equal(parameters.stiffness, 80);
  assert.equal(parameters.damping, 5);
});

test("shorts geometry has a fixed quality-forward runtime budget", () => {
  assert.deepEqual(estimateBasketballShortsCost(), {
    drawCalls: 2,
    garmentTriangles: 560,
    waistbandTriangles: 48,
    totalTriangles: 608,
    dynamicVertices: 320,
    collisionTestsPerFrame: 320,
    textures: 0,
  });
});

test("thigh collision pushes a cloth vertex to the capsule surface", () => {
  const position = new Float32Array([0.165, -0.3, 0.03]);
  const capsule = {
    startX: 0.165,
    startY: -0.05,
    startZ: 0,
    endX: 0.165,
    endY: -0.59,
    endZ: 0,
  };
  const correction = constrainShortsVertexToCapsule(position, 0, capsule, 0.13, 1);
  assert.ok(correction > 0.09);
  assert.ok(Math.abs(position[2] - 0.13) < 1e-5);
});

test("damped cloth spring approaches its target without an unstable leap", () => {
  let state = { position: 0, velocity: 0 };
  for (let frame = 0; frame < 60; frame += 1) {
    state = stepShortsSpring(state, 0.05, 1 / 60, 48, 10.5);
  }
  assert.ok(state.position > 0.045);
  assert.ok(state.position < 0.055);
  assert.ok(Math.abs(state.velocity) < 0.02);
});
