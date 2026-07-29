import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("player model lab exposes stable visual QA controls and capture naming", async () => {
  const [html, source] = await Promise.all([
    readFile(new URL("player-lab.html", root), "utf8"),
    readFile(new URL("js/player-model-lab.js", root), "utf8"),
  ]);

  for (const control of [
    "lab-athlete",
    "lab-pose",
    "lab-view",
    "lab-compare",
    "lab-wireframe",
    "lab-turntable",
    "lab-guides",
    "lab-capture",
    "lab-limb",
    "lab-upper-x",
    "lab-upper-y",
    "lab-upper-z",
    "lab-bend-x",
    "lab-bend-y",
    "lab-bend-z",
    "lab-reset-limb",
    "lab-reset-pose",
    "lab-save-pose",
    "lab-copy-pose",
  ]) {
    assert.match(html, new RegExp(`id="${control}"`));
  }
  assert.match(source, /npc-\$\{athlete\}-\$\{state\.pose\}-\$\{state\.view\}-full-body\.png/);
  assert.match(source, /__NOVA_PLAYER_LAB__/);
  assert.match(source, /renderer\.info\.render\.triangles/);
  assert.match(source, /assetLoadStatus: "procedural-production-rig-ready"/);
  assert.match(source, /nova-court\.player-lab\.pose-drafts\.v2/);
  assert.match(source, /schema: "nova-court-player-pose-v1"/);
  assert.match(source, /poseReport: createPoseReport/);
  assert.match(source, /navigator\.clipboard\.writeText/);
});

test("player model lab maps anatomical sides and defensive rotations correctly", async () => {
  const source = await readFile(new URL("js/player-model-lab.js", root), "utf8");

  assert.match(source, /"left-arm": Object\.freeze\(\{\s+type: "arm",\s+index: 1,/);
  assert.match(source, /"right-arm": Object\.freeze\(\{\s+type: "arm",\s+index: 0,/);
  assert.match(source, /"left-leg": Object\.freeze\(\{\s+type: "leg",\s+index: 1,/);
  assert.match(source, /"right-leg": Object\.freeze\(\{\s+type: "leg",\s+index: 0,/);
  assert.match(source, /const \[rightArm, leftArm\] = player\.arms;/);
  assert.match(source, /const \[rightLeg, leftLeg\] = player\.legs;/);

  assert.match(source, /const DEFENSIVE_POSE_ROTATIONS = BALL_HANDLER_GUARD_POSE;/);
  assert.match(source, /leftArm\.shoulder\.rotation\.set\(\.\.\.DEFENSIVE_POSE_ROTATIONS\.leftShoulder\.map\(toRadians\)\)/);
  assert.match(source, /rightArm\.shoulder\.rotation\.set\(\.\.\.DEFENSIVE_POSE_ROTATIONS\.rightShoulder\.map\(toRadians\)\)/);
  assert.match(source, /leftArm\.elbow\.rotation\.set\(\.\.\.DEFENSIVE_POSE_ROTATIONS\.leftElbow\.map\(toRadians\)\)/);
  assert.match(source, /rightArm\.elbow\.rotation\.set\(\.\.\.DEFENSIVE_POSE_ROTATIONS\.rightElbow\.map\(toRadians\)\)/);
});

test("production build includes the player model lab entry point", async () => {
  const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(build, /"player-lab\.html"/);
});

test("production athlete rig includes articulated silhouette and face improvements", async () => {
  const engine = await readFile(new URL("js/engine.js", root), "utf8");
  for (const feature of [
    "shortLeg",
    "waistband",
    "jaw",
    "sclera",
    "brow",
    "deltoid",
    "elbowJoint",
    "kneeCap",
    "toe",
    "ankleCollar",
  ]) {
    assert.match(engine, new RegExp(`const ${feature} =`));
  }
  assert.doesNotMatch(engine, /const headband =/);
});
