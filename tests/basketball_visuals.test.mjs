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
  BASKETBALL_STYLE_IDS,
  BASKETBALL_TEXTURE_HEIGHT,
  BASKETBALL_TEXTURE_WIDTH,
  applyBasketballStyle,
  basketballCurvedSeamPoint,
  basketballPanelIndex,
  basketballSeamDistances,
  createBasketballTextureData,
  normalizeBasketballStyle,
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
  assert.equal(first.metadata.style, "classic");
});

test("red, white, and blue finish changes only the authored color panels", () => {
  const classic = createBasketballTextureData({ style: "classic" });
  const alternate = createBasketballTextureData({ style: "redWhiteBlue" });

  assert.deepEqual(BASKETBALL_STYLE_IDS, ["classic", "redWhiteBlue"]);
  assert.equal(normalizeBasketballStyle("redWhiteBlue"), "redWhiteBlue");
  assert.equal(normalizeBasketballStyle("unknown"), "classic");
  assert.notDeepEqual(alternate.albedo, classic.albedo);
  assert.deepEqual(alternate.bump, classic.bump);
  assert.deepEqual(alternate.roughness, classic.roughness);
  assert.equal(alternate.metadata.style, "redWhiteBlue");
  assert.equal(alternate.metadata.textureBytes, classic.metadata.textureBytes);
});

test("alternate colors follow four front-facing panels bounded by real channels", () => {
  assert.equal(basketballPanelIndex(0, 0.9, 0.435), 7);
  assert.equal(basketballPanelIndex(0, 0.35, 0.936), 6);
  assert.equal(basketballPanelIndex(0, -0.35, 0.936), 2);
  assert.equal(basketballPanelIndex(0, -0.9, 0.435), 3);
});

test("runtime style switching replaces one albedo map without growing the texture registry", () => {
  class FakeDataTexture {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
      this.disposed = false;
    }

    dispose() {
      this.disposed = true;
    }
  }
  const T = {
    DataTexture: FakeDataTexture,
    RGBAFormat: "rgba",
    UnsignedByteType: "ubyte",
    RepeatWrapping: "repeat",
    ClampToEdgeWrapping: "clamp",
    LinearMipmapLinearFilter: "mipmap",
    LinearFilter: "linear",
    SRGBColorSpace: "srgb",
  };
  const previousMap = new FakeDataTexture(new Uint8Array(4), 1, 1);
  const bumpMap = new FakeDataTexture(new Uint8Array(4), 1, 1);
  const roughnessMap = new FakeDataTexture(new Uint8Array(4), 1, 1);
  const mesh = {
    material: { map: previousMap, bumpMap, roughnessMap, needsUpdate: false },
    userData: { visualProfile: { style: "classic" } },
  };
  const registry = [previousMap, bumpMap, roughnessMap];

  assert.equal(applyBasketballStyle(T, mesh, "redWhiteBlue", {
    anisotropy: 4,
    textureRegistry: registry,
  }), "redWhiteBlue");
  assert.equal(registry.length, 3);
  assert.equal(registry[0], mesh.material.map);
  assert.equal(previousMap.disposed, true);
  assert.equal(mesh.material.needsUpdate, true);
  assert.equal(mesh.userData.visualProfile.style, "redWhiteBlue");

  const selectedMap = mesh.material.map;
  assert.equal(applyBasketballStyle(T, mesh, "redWhiteBlue", {
    textureRegistry: registry,
  }), "redWhiteBlue");
  assert.equal(mesh.material.map, selectedMap);
  assert.equal(registry.length, 3);

  for (let index = 0; index < 12; index += 1) {
    const previous = mesh.material.map;
    const style = index % 2 === 0 ? "classic" : "redWhiteBlue";
    assert.equal(applyBasketballStyle(T, mesh, style, {
      textureRegistry: registry,
    }), style);
    assert.equal(registry.length, 3, "style swaps must replace, not append, albedo maps");
    assert.equal(registry[0], mesh.material.map);
    assert.equal(previous.disposed, true);
  }
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
  assert.match(engine, /setBasketballStyle\(style\)/);
  assert.match(engine, /applyBasketballStyle\(this\.T, this\.ballMesh/);
  assert.match(lab, /const basketballPrototype = createBasketballMesh\(T, 0\.12/);
  assert.match(lab, /normalizeBasketballStyle\(query\.get\("ball"\)\)/);
  assert.doesNotMatch(engine, /new T\.LineLoop/);
});
