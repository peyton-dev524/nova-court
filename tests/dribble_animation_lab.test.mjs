import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DRIBBLE_NAMED_FRAMES,
  FEATURED_DRIBBLE_MOVES,
  featuredDribbleFrameName,
  sampleFeaturedDribbleMove,
} from "../js/dribble-animation.js";
import { getDribbleMovePath } from "../js/engine.js";

const root = new URL("../", import.meta.url);
const distance = (a, b) => Math.hypot(
  a.ball.side - b.ball.side,
  a.ball.height - b.ball.height,
  a.ball.forward - b.ball.forward,
);

test("featured dribble endpoints land on matching hand targets", () => {
  for (const move of FEATURED_DRIBBLE_MOVES) {
    const start = sampleFeaturedDribbleMove(move, 0, 1);
    const finish = sampleFeaturedDribbleMove(move, 1, 1);
    assert.equal(start.ball.side > 0, true, `${move} begins on the authored side`);
    assert.equal(finish.ball.side < 0, true, `${move} finishes across the body`);
    assert.equal(start.endHand, -1);
    assert.equal(finish.endHand, -1);
    assert.equal(start.hands.startWeight, 1);
    assert.equal(start.hands.endWeight, 0);
    assert.equal(finish.hands.startWeight, 0);
    assert.equal(finish.hands.endWeight, 1);
  }
});

test("crossover follows a continuous bounce with bounded step and torso clearance", () => {
  let previous = sampleFeaturedDribbleMove("crossover", 0, 1);
  let maximumStep = 0;
  for (let index = 1; index <= 240; index++) {
    const sample = sampleFeaturedDribbleMove("crossover", index / 240, 1);
    maximumStep = Math.max(maximumStep, distance(previous, sample));
    assert.ok(Number.isFinite(sample.ball.side + sample.ball.height + sample.ball.forward));
    if (Math.abs(sample.ball.side) < 0.2) {
      assert.ok(sample.ball.height < 0.45, "center crossing happens below the torso");
      assert.ok(sample.ball.forward >= 0.35, "center crossing stays in front of the torso");
    }
    previous = sample;
  }
  assert.ok(maximumStep < 0.017, `bounded 240 Hz path step: ${maximumStep}`);
});

test("spin completes one vertical rotation with stepping feet and a protected hip radius", () => {
  const start = sampleFeaturedDribbleMove("spin", 0, 1);
  const middle = sampleFeaturedDribbleMove("spin", 0.5, 1);
  const finish = sampleFeaturedDribbleMove("spin", 1, 1);
  assert.equal(start.pose.spinAngle, 0);
  assert.ok(Math.abs(middle.pose.spinAngle - Math.PI) < 1e-12);
  assert.ok(Math.abs(finish.pose.spinAngle - Math.PI * 2) < 1e-12);
  assert.ok(Math.abs(finish.pose.rootX - start.pose.rootX) <= 0.17);
  assert.ok(Math.abs(finish.pose.rootZ - start.pose.rootZ) <= 0.23);

  let previous = start;
  for (let index = 1; index <= 240; index++) {
    const sample = sampleFeaturedDribbleMove("spin", index / 240, 1);
    assert.ok(sample.diagnostics.protectedRadius >= 0.57 - 1e-9);
    assert.ok(distance(previous, sample) < 0.022);
    previous = sample;
  }
});

test("left and right choreography mirror without changing height or depth", () => {
  for (const move of FEATURED_DRIBBLE_MOVES) {
    for (const progress of [0, 0.17, 0.5, 0.83, 1]) {
      const right = sampleFeaturedDribbleMove(move, progress, 1);
      const left = sampleFeaturedDribbleMove(move, progress, -1);
      assert.ok(Math.abs(right.ball.side + left.ball.side) < 1e-12);
      assert.ok(Math.abs(right.ball.height - left.ball.height) < 1e-12);
      assert.ok(Math.abs(right.ball.forward - left.ball.forward) < 1e-12);
      assert.ok(Math.abs(right.pose.rootX + left.pose.rootX) < 1e-12);
      assert.ok(Math.abs(right.pose.spinAngle + left.pose.spinAngle) < 1e-12);
      assert.ok(Math.abs(right.pose.leftHip - left.pose.rightHip) < 1e-12);
      assert.ok(Math.abs(right.pose.leftKnee - left.pose.rightKnee) < 1e-12);
    }
  }
});

test("production gameplay samples the exact reviewed crossover and spin ball paths", () => {
  for (const move of FEATURED_DRIBBLE_MOVES) {
    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
      const production = getDribbleMovePath(move, progress, 1);
      const reviewed = sampleFeaturedDribbleMove(move, progress, 1);
      assert.deepEqual(production, { ...reviewed.ball, endHand: reviewed.endHand });
    }
  }
});

test("production athlete pose consumes the same featured choreography sample", async () => {
  const engine = await readFile(new URL("js/engine.js", root), "utf8");
  assert.match(engine, /const featuredMoveSample = moveActive/);
  assert.match(engine, /moveTurn = featuredMoveSample\.pose\.torsoYaw/);
  assert.match(engine, /hip: featuredMoveSample\.pose\.rightHip/);
  assert.match(engine, /player\.dribbleMove === "spin"\) player\.hips\.rotation\.y = 0/);
});

test("named frames remain deterministic and expose reviewable phases", () => {
  assert.deepEqual(Object.keys(DRIBBLE_NAMED_FRAMES.crossover), ["start", "carry", "handoff", "finish"]);
  assert.equal(featuredDribbleFrameName("crossover", 0), "start");
  assert.equal(featuredDribbleFrameName("crossover", 0.5), "handoff");
  assert.equal(featuredDribbleFrameName("spin", 1), "finish");
});

test("dribble lab exposes required controls, hook, production factories, and no added assets", async () => {
  const [html, lab, build, animation] = await Promise.all([
    readFile(new URL("dribble-lab.html", root), "utf8"),
    readFile(new URL("js/dribble-lab.js", root), "utf8"),
    readFile(new URL("scripts/build.mjs", root), "utf8"),
    readFile(new URL("js/dribble-animation.js", root), "utf8"),
  ]);
  for (const id of [
    "dribble-play",
    "dribble-reset",
    "dribble-loop",
    "dribble-speed",
    "dribble-progress",
    "dribble-mirror",
    "dribble-trace",
    "dribble-wireframe",
    "dribble-guides",
    "dribble-capture",
  ]) assert.match(html, new RegExp(`id="${id}"`));

  assert.match(lab, /new ProceduralPlayer/);
  assert.match(lab, /createBasketballMesh/);
  assert.match(lab, /__NOVA_DRIBBLE_LAB__/);
  assert.match(lab, /setMove/);
  assert.match(lab, /setProgress/);
  assert.match(lab, /getState/);
  assert.match(build, /"dribble-lab\.html"/);
  assert.doesNotMatch(`${html}\n${lab}\n${animation}`, /\.(png|jpe?g|webp|glb|gltf|fbx|obj)(\?|["'])/i);
});
