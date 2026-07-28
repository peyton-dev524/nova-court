import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  BASKETBALL_CHANNEL_OUTER_HALF_ANGLE,
  BASKETBALL_CURVED_SEAM_AMPLITUDE,
  BASKETBALL_CURVED_SEAM_PHASE,
  BASKETBALL_MAX_CHANNEL_WIDTH_MM,
  BASKETBALL_REFERENCE_CURVE_INTERSECTION_OFFSET,
  BASKETBALL_REFERENCE_RADIUS_MM,
  BASKETBALL_TEXTURE_HEIGHT,
  BASKETBALL_TEXTURE_WIDTH,
  basketballCurvedSeamPoint,
  basketballSeamDistances,
  createBasketballTextureData,
} from "../js/basketball-visuals.js";

function pixel(array, width, x, y) {
  const offset = (y * width + x) * 4;
  return [...array.slice(offset, offset + 4)];
}

test("basketball texture channels stay compact, independent, and deterministic", () => {
  const first = createBasketballTextureData();
  const second = createBasketballTextureData();

  assert.equal(first.width, BASKETBALL_TEXTURE_WIDTH);
  assert.equal(first.height, BASKETBALL_TEXTURE_HEIGHT);
  assert.notEqual(first.albedo.buffer, first.bump.buffer);
  assert.notEqual(first.bump.buffer, first.roughness.buffer);
  assert.deepEqual(first.albedo, second.albedo);
  assert.deepEqual(first.bump, second.bump);
  assert.deepEqual(first.roughness, second.roughness);
  assert.equal(
    first.metadata.textureBytes,
    BASKETBALL_TEXTURE_WIDTH * BASKETBALL_TEXTURE_HEIGHT * 4 * 3,
  );
  assert.equal(first.metadata.topology, "traditional-eight-panel-spherical-wave");
  assert.equal(first.metadata.maximumChannelWidthMm, 6.35);
});

test("basketball scale and channel width follow regulation-size measurements", () => {
  assert.ok(BASKETBALL_REFERENCE_RADIUS_MM > 120 && BASKETBALL_REFERENCE_RADIUS_MM < 122);
  assert.ok(Math.abs(
    BASKETBALL_CHANNEL_OUTER_HALF_ANGLE * BASKETBALL_REFERENCE_RADIUS_MM * 2
      - BASKETBALL_MAX_CHANNEL_WIDTH_MM,
  ) < 1e-12);
  assert.ok(Math.abs(
    Math.cos(BASKETBALL_CURVED_SEAM_AMPLITUDE)
      - BASKETBALL_REFERENCE_CURVE_INTERSECTION_OFFSET,
  ) < 1e-12);
});

test("traditional seam uses two great circles and one continuous spherical wave", () => {
  for (const azimuth of [0, 0.37, Math.PI / 2, Math.PI, Math.PI * 1.73, Math.PI * 2]) {
    const point = basketballCurvedSeamPoint(azimuth);
    const distances = basketballSeamDistances(point.x, point.y, point.z);
    assert.ok(distances.curved < 1e-12);
    assert.ok(Math.abs(Math.hypot(point.x, point.y, point.z) - 1) < 1e-12);
  }

  const start = basketballCurvedSeamPoint(0);
  const end = basketballCurvedSeamPoint(Math.PI * 2);
  assert.ok(Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z) < 1e-12);
});

test("curved channel crosses each visible great circle twice away from their intersection", () => {
  const yCircleIntersections = [0, Math.PI].map((azimuth) => (
    basketballCurvedSeamPoint(
      azimuth,
      BASKETBALL_CURVED_SEAM_AMPLITUDE,
      BASKETBALL_CURVED_SEAM_PHASE,
    )
  ));
  const zCircleIntersections = [Math.PI / 2, Math.PI * 1.5].map((azimuth) => (
    basketballCurvedSeamPoint(
      azimuth,
      BASKETBALL_CURVED_SEAM_AMPLITUDE,
      BASKETBALL_CURVED_SEAM_PHASE,
    )
  ));

  for (const point of yCircleIntersections) {
    assert.ok(Math.abs(point.y) < 1e-12);
    assert.ok(Math.abs(point.z) > 0.5);
  }
  for (const point of zCircleIntersections) {
    assert.ok(Math.abs(point.z) < 1e-12);
    assert.ok(Math.abs(point.x) > 0.5);
  }
});

test("the removed third great circle is not accidentally retained", () => {
  const azimuth = Math.PI / 8;
  const point = {
    x: 0,
    y: Math.sin(azimuth),
    z: Math.cos(azimuth),
  };
  const distances = basketballSeamDistances(point.x, point.y, point.z);

  assert.ok(distances.greatCircleY > 0.3);
  assert.ok(distances.greatCircleZ > 0.3);
  assert.ok(distances.curved > 0.2);
  assert.ok(distances.minimum > 0.2);
});

test("basketball grooves are darker, lower, and rougher than rubber panels", () => {
  const textures = createBasketballTextureData();
  const groove = pixel(textures.albedo, textures.width, 128, 64);
  const panel = pixel(textures.albedo, textures.width, 148, 45);
  const grooveBump = pixel(textures.bump, textures.width, 128, 64)[0];
  const panelBump = pixel(textures.bump, textures.width, 148, 45)[0];
  const grooveRoughness = pixel(textures.roughness, textures.width, 128, 64)[0];
  const panelRoughness = pixel(textures.roughness, textures.width, 148, 45)[0];

  assert.ok(groove[0] < panel[0] * 0.5);
  assert.ok(grooveBump < panelBump);
  assert.ok(grooveRoughness > panelRoughness);
  assert.equal(groove[3], 255);
});

test("basketball panel bump data contains visible pebble variation", () => {
  const { bump, width } = createBasketballTextureData();
  const values = new Set();
  for (let y = 34; y < 48; y += 1) {
    for (let x = 136; x < 150; x += 1) {
      values.add(pixel(bump, width, x, y)[0]);
    }
  }
  assert.ok(values.size > 20);
  assert.ok(Math.max(...values) - Math.min(...values) > 25);
});

test("game and model lab share the procedural basketball factory", async () => {
  const [engine, lab] = await Promise.all([
    readFile(new URL("../js/engine.js", import.meta.url), "utf8"),
    readFile(new URL("../js/player-model-lab.js", import.meta.url), "utf8"),
  ]);

  assert.match(engine, /createBasketballMesh\(T, COURT\.ballRadius/);
  assert.match(lab, /const basketballPrototype = createBasketballMesh\(T, 0\.12/);
  assert.doesNotMatch(engine, /new T\.LineLoop/);
});
