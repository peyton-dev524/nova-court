import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

import {
  calculateHandDimensions,
  createProceduralHand,
  HAND_ANTHROPOMETRY,
  PLAYER_LEG_PROPORTIONS,
  PLAYER_RIG_HEIGHT_LOCAL,
  playerRigScaleForHeight,
} from "../js/player-anatomy.js";
import {
  formatPlayerHeight,
  HAIR_STYLES,
  normalizePlayerHeight,
  PLAYER_HEIGHT_RANGE,
  SKIN_TONES,
} from "../js/player-appearance.js";
import {
  createDefaultProfile,
  getEnginePlayerConfig,
  loadProfile,
  normalizeProfile,
  PROFILE_STORAGE_KEY,
  saveProfile,
  updatePlayerIdentity,
} from "../js/player-progression.js";

const root = new URL("../", import.meta.url);

async function loadThree() {
  const source = await readFile(new URL("vendor/three.min.js", root), "utf8");
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    console,
    globalThis: {},
    self: {},
  });
  vm.runInContext(source, context, { filename: "three.min.js" });
  return module.exports;
}

test("leg radii are centralized and taper proportionally into the current ankle fit", () => {
  assert.ok(PLAYER_LEG_PROPORTIONS.thigh.radius < 0.1);
  assert.ok(PLAYER_LEG_PROPORTIONS.knee.radius < 0.095);
  assert.ok(PLAYER_LEG_PROPORTIONS.calf.radius < 0.08);
  assert.ok(PLAYER_LEG_PROPORTIONS.thigh.radius / 0.082 < 1.2);
  assert.ok(PLAYER_LEG_PROPORTIONS.calf.radius / 0.082 < 0.94);
  const shortScale = playerRigScaleForHeight(PLAYER_HEIGHT_RANGE.minM);
  const tallScale = playerRigScaleForHeight(PLAYER_HEIGHT_RANGE.maxM);
  assert.ok(tallScale.y > shortScale.y);
  assert.ok((tallScale.x / shortScale.x) < (tallScale.y / shortScale.y));
});

test("hand dimensions reproduce pooled anthropometric length and breadth ratios", () => {
  const dimensions = calculateHandDimensions();
  assert.equal(dimensions.handLength / PLAYER_RIG_HEIGHT_LOCAL, HAND_ANTHROPOMETRY.lengthToStature);
  assert.equal(dimensions.handBreadth / dimensions.handLength, HAND_ANTHROPOMETRY.breadthToLength);
  assert.ok(Math.abs(HAND_ANTHROPOMETRY.lengthToStature - 0.1039) < 0.0002);
  assert.ok(Math.abs(HAND_ANTHROPOMETRY.breadthToLength - 0.4611) < 0.0002);
  assert.ok(dimensions.fingers.middle.length > dimensions.fingers.index.length);
  assert.ok(dimensions.fingers.index.length > dimensions.fingers.little.length);
  assert.ok(dimensions.fingers.thumb.baseRadius > dimensions.fingers.index.baseRadius);
});

test("procedural hands expose five tapered digits, wrist attachment, and mirrored opposition", async () => {
  const T = await loadThree();
  const material = new T.MeshStandardMaterial({ color: 0x9d6548 });
  const left = createProceduralHand(T, { side: 1, material });
  const right = createProceduralHand(T, { side: -1, material });
  assert.deepEqual(Object.keys(left.digits), ["index", "middle", "ring", "little", "thumb"]);
  for (const id of Object.keys(left.digits)) {
    assert.ok(left.digits[id].proximal.geometry);
    assert.ok(left.digits[id].distal.geometry);
    assert.ok(left.digits[id].distalPivot.position.y < 0);
    assert.ok(Math.abs(left.digits[id].root.position.x + right.digits[id].root.position.x) < 1e-12);
    assert.ok(Math.abs(left.digits[id].root.rotation.z + right.digits[id].root.rotation.z) < 1e-12);
  }
  assert.ok(left.digits.thumb.root.position.x > 0);
  assert.ok(right.digits.thumb.root.position.x < 0);
  assert.equal(left.root.userData.sculptRuntime.pivot, "wrist");
  assert.equal(left.root.userData.sculptRuntime.attachment.contactType, "overlap");
  assert.ok(left.root.userData.sculptRuntime.attachment.overlap > 0);
});

test("customization offers eight inclusive tones and eight original hairstyles", () => {
  assert.equal(HAIR_STYLES.length, 8);
  assert.equal(new Set(HAIR_STYLES.map((style) => style.id)).size, 8);
  assert.equal(SKIN_TONES.length, 8);
  assert.equal(new Set(SKIN_TONES.map((tone) => tone.color)).size, 8);
});

test("height normalization clamps, formats, persists, and reaches only controlled profile config", () => {
  assert.equal(normalizePlayerHeight(1), PLAYER_HEIGHT_RANGE.minM);
  assert.equal(normalizePlayerHeight(3), PLAYER_HEIGHT_RANGE.maxM);
  assert.equal(formatPlayerHeight(1.68), `5'6" / 1.68 m`);
  assert.equal(formatPlayerHeight(2.18), `7'2" / 2.18 m`);

  const updated = updatePlayerIdentity(createDefaultProfile(), {
    displayName: "Sky",
    hairStyleId: "locs",
    skinToneId: "deep-espresso",
    heightM: 2.18,
  });
  assert.equal(updated.ok, true);
  const writes = new Map();
  const storage = {
    getItem: (key) => writes.get(key) ?? null,
    setItem: (key, value) => writes.set(key, value),
  };
  saveProfile(updated.profile, storage, 17);
  assert.ok(writes.has(PROFILE_STORAGE_KEY));
  const loaded = loadProfile(storage);
  assert.equal(loaded.identity.heightM, 2.18);
  assert.equal(loaded.identity.hairStyleId, "locs");
  assert.equal(loaded.identity.skinToneId, "deep-espresso");
  const config = getEnginePlayerConfig(loaded);
  assert.equal(config.height, 2.18);
  assert.equal(config.hairStyle, "locs");
  assert.equal(config.skinColor, SKIN_TONES[0].color);
});

test("version-four profiles migrate bundled appearances into independent hair and skin fields", () => {
  const migrated = normalizeProfile({
    version: 4,
    selectedPosition: "SG",
    identity: {
      created: true,
      displayName: "Legacy Wing",
      appearanceId: "braided",
    },
  });
  assert.equal(migrated.identity.hairStyleId, "braids");
  assert.equal(migrated.identity.skinToneId, "deep-espresso");
  assert.equal(migrated.identity.heightM, 1.94);
});

test("game and model lab wiring keep CPU roster authorship and expose deterministic anatomy views", async () => {
  const [engine, app, lab, html] = await Promise.all([
    readFile(new URL("js/engine.js", root), "utf8"),
    readFile(new URL("js/app.js", root), "utf8"),
    readFile(new URL("js/player-model-lab.js", root), "utf8"),
    readFile(new URL("player-lab.html", root), "utf8"),
  ]);
  assert.match(engine, /createProceduralHand/);
  assert.match(engine, /PLAYER_LEG_PROPORTIONS/);
  assert.match(engine, /playerRigScaleForHeight/);
  assert.match(app, /\.\.\.\(player\.controlled \? controlled : \{\}\)/);
  assert.match(lab, /"hand-front"/);
  assert.match(lab, /"legs-three-quarter"/);
  assert.match(lab, /setHeightComparison/);
  assert.match(html, /value="hand-profile"/);
  assert.match(html, /value="tall"/);
});
