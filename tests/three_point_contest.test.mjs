import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createGameMode, MODE_IDS, MODE_PHASES } from "../js/modes.js";
import {
  ARC_RUN_GRAB_DURATION,
  createArcRunCameraSnapshot,
  THREE_POINT_BALLS_PER_RACK,
  THREE_POINT_MONEY_BALL_POINTS,
  THREE_POINT_MONEY_BALL_STYLE,
  THREE_POINT_NORMAL_BALL_POINTS,
  THREE_POINT_NORMAL_BALL_STYLE,
  NBA_ABOVE_BREAK_THREE_METERS,
  NBA_CORNER_THREE_METERS,
  THREE_POINT_RACKS,
  contestRackDistance,
  createContestBallSequence,
  createThreePointRackVisuals,
  getThreePointRackPresentation,
  getThreePointRackSpaceMetrics,
  sampleArcRunGrab,
  THREE_POINT_RACK_SPACE,
} from "../js/three-point-contest.js";

function startLive(config = {}) {
  const mode = createGameMode(MODE_IDS.THREE_POINT_CONTEST, {
    countdown: 0.01,
    duration: 60,
    targetScore: 18,
    ...config,
  });
  mode.start({ userTeamId: "home" });
  const live = mode.update(0.02);
  assert.equal(mode.phase, MODE_PHASES.LIVE);
  return { mode, live };
}

test("five stations follow the NBA 22 ft corner and 23 ft 9 in above-break line", () => {
  assert.equal(THREE_POINT_RACKS.length, 5);
  assert.deepEqual(
    THREE_POINT_RACKS.map((rack) => rack.id),
    ["left_corner", "left_wing", "top", "right_wing", "right_corner"],
  );
  const uniqueStations = new Set();
  for (const [index, rack] of THREE_POINT_RACKS.entries()) {
    const distance = contestRackDistance(rack);
    const expectedDistance = index === 0 || index === 4
      ? NBA_CORNER_THREE_METERS
      : NBA_ABOVE_BREAK_THREE_METERS;
    assert.ok(
      Math.abs(distance - expectedDistance) <= (index === 0 || index === 4 ? 0.02 : 1e-9),
      `${rack.id} distance ${distance.toFixed(4)} must match its NBA line segment`,
    );
    assert.ok(Math.abs(rack.x) < 7.5, `${rack.id} must remain on court`);
    assert.ok(Math.abs(rack.z) < 7, `${rack.id} must remain on court`);
    uniqueStations.add(`${rack.x.toFixed(4)},${rack.z.toFixed(4)}`);
  }
  assert.equal(uniqueStations.size, 5);
  assert.equal(THREE_POINT_RACKS[0].x, -THREE_POINT_RACKS[4].x);
  assert.equal(THREE_POINT_RACKS[0].z, THREE_POINT_RACKS[4].z);
  assert.equal(THREE_POINT_RACKS[1].x, -THREE_POINT_RACKS[3].x);
  assert.equal(THREE_POINT_RACKS[1].z, THREE_POINT_RACKS[3].z);
  assert.equal(THREE_POINT_RACKS[2].x, 0);
});

test("every rack runs radially toward the hoop with bounded footprint and pickup space", () => {
  for (const rack of THREE_POINT_RACKS) {
    const presentation = getThreePointRackPresentation(rack);
    const space = getThreePointRackSpaceMetrics(rack);
    assert.ok(presentation.forwardToHoopDot > 0.999999, `${rack.id} forward cue faces hoop`);
    assert.ok(Number.isFinite(presentation.visualYaw), `${rack.id} visual yaw is finite`);
    assert.equal(presentation.layout, "radial");
    assert.ok(
      presentation.rackAxisShooterToHoopDot < -0.999999,
      `${rack.id} is parallel to the hoop line and ordered away from the hoop`,
    );
    assert.ok(
      Math.abs(
        presentation.rackAxis.x * presentation.widthAxis.x
          + presentation.rackAxis.z * presentation.widthAxis.z,
      ) < 1e-10,
      `${rack.id} length and width axes stay perpendicular`,
    );
    assert.ok(
      space.boundaryClearance >= THREE_POINT_RACK_SPACE.boundaryMargin - 1e-9,
      `${rack.id} footprint clears court bounds`,
    );
    assert.ok(
      space.playerBodyClearance >= THREE_POINT_RACK_SPACE.minPlayerBodyClearance,
      `${rack.id} frame clears the player body`,
    );
    assert.ok(
      space.maxPickupDistance <= THREE_POINT_RACK_SPACE.maxPickupReach,
      `${rack.id} balls remain within pickup reach`,
    );
  }
});

test("Arc Run camera is behind the shooter, aims toward the hoop, and has smooth finite rack endpoints", () => {
  const snapshots = THREE_POINT_RACKS.map((rack) => createArcRunCameraSnapshot({
    shooter: { x: rack.x, y: 0, z: rack.z },
    basket: { x: 0, y: 3.05, z: -5.7 },
    rack,
  }));
  for (const [index, snapshot] of snapshots.entries()) {
    for (const value of [
      ...Object.values(snapshot.position),
      ...Object.values(snapshot.target),
      snapshot.fov,
    ]) assert.ok(Number.isFinite(value), `${THREE_POINT_RACKS[index].id} camera is finite`);
    assert.ok(snapshot.behindShooterDot > 0.3);
    assert.ok(snapshot.cameraTowardHoopDot > 0.9);
    assert.ok(snapshot.rackFramingDot > 0.9, `${THREE_POINT_RACKS[index].id} rack stays framed`);
    assert.ok(snapshot.fov >= 47 && snapshot.fov <= 58);
    assert.ok(Math.abs(snapshot.position.x) <= 9.051);
    assert.ok(Math.abs(snapshot.position.z) <= 8.201);
  }
  for (let index = 1; index < snapshots.length; index += 1) {
    const previous = snapshots[index - 1].position;
    const current = snapshots[index].position;
    const transitionDistance = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
      current.z - previous.z,
    );
    assert.ok(transitionDistance > 0.1 && transitionDistance < 9.5);
  }
});

test("each rack deterministically ends with a two-point tricolor money ball", () => {
  const sequence = createContestBallSequence();
  assert.equal(sequence.length, THREE_POINT_RACKS.length * THREE_POINT_BALLS_PER_RACK);
  sequence.forEach((ball, sequenceIndex) => {
    assert.equal(ball.sequenceIndex, sequenceIndex);
    assert.equal(
      ball.rackIndex,
      Math.floor(sequenceIndex / THREE_POINT_BALLS_PER_RACK),
    );
    assert.equal(ball.ballIndex, sequenceIndex % THREE_POINT_BALLS_PER_RACK);
    const money = ball.ballIndex === THREE_POINT_BALLS_PER_RACK - 1;
    assert.equal(ball.isMoneyBall, money);
    assert.equal(
      ball.value,
      money ? THREE_POINT_MONEY_BALL_POINTS : THREE_POINT_NORMAL_BALL_POINTS,
    );
    assert.equal(
      ball.ballStyle,
      money ? THREE_POINT_MONEY_BALL_STYLE : THREE_POINT_NORMAL_BALL_STYLE,
    );
  });
});

test("money ball is fifth on all five racks before and after deterministic restarts", () => {
  const mode = createGameMode(MODE_IDS.THREE_POINT_CONTEST, { countdown: 0.01 });
  const assertRackOrder = (label) => {
    const sequence = mode.getRules().ballSequence;
    for (let rackIndex = 0; rackIndex < 5; rackIndex += 1) {
      const rack = sequence.filter((ball) => ball.rackIndex === rackIndex);
      assert.deepEqual(
        rack.map((ball) => ball.isMoneyBall),
        [false, false, false, false, true],
        `${label}: rack ${rackIndex + 1} keeps money ball last`,
      );
      assert.equal(rack[0].ballStyle, THREE_POINT_NORMAL_BALL_STYLE);
      assert.equal(rack[4].ballStyle, THREE_POINT_MONEY_BALL_STYLE);
    }
  };
  mode.start({ userTeamId: "home" });
  assertRackOrder("opening run");
  mode.update(0.02);
  for (let index = 0; index < 9; index += 1) {
    const shotId = `restart-order-${index}`;
    mode.handleEvent("SHOT_ATTEMPT", { shotId });
    mode.handleEvent("MISS", { shotId });
  }
  const restarted = mode.handleEvent("RESTART");
  assert.equal(mode.getState().currentBall.isMoneyBall, false);
  assert.equal(mode.getState().ballIndex, 0);
  assert.ok(restarted.commands.some((command) =>
    command.type === "COUNTDOWN" && command.seconds === 1));
  assertRackOrder("restarted run");
  const liveAgain = mode.update(0.02);
  const openingBall = liveAgain.commands.find((command) => command.type === "SPAWN_RACK_BALL");
  assert.equal(openingBall.ballIndex, 0);
  assert.equal(openingBall.isMoneyBall, false);
});

test("Arc Run grab has continuous reach, contact, and pull-to-gather phases", () => {
  assert.equal(ARC_RUN_GRAB_DURATION, 0.64);
  const samples = [0, 0.2, 0.4, 0.52, 0.76, 1].map((progress) =>
    sampleArcRunGrab(progress, -1));
  assert.deepEqual(
    [samples[0].phase, samples[2].phase, samples[4].phase, samples[5].phase],
    ["reach", "contact", "gather", "complete"],
  );
  assert.equal(samples[0].ballBlend, 0);
  assert.equal(samples[2].ballBlend, 0);
  assert.equal(samples[5].ballBlend, 1);
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(samples[index].ballBlend >= samples[index - 1].ballBlend);
  }
  for (const sample of samples) {
    assert.equal(sample.handSign, -1);
    for (const value of Object.values(sample).filter((entry) => typeof entry === "number")) {
      assert.ok(Number.isFinite(value));
    }
  }
});

test("3-2-1 countdown freezes the contest clock and rejects shot input until live", () => {
  const mode = createGameMode(MODE_IDS.THREE_POINT_CONTEST, {
    countdown: 3,
    duration: 60,
  });
  const opening = mode.start({ userTeamId: "home" });
  assert.equal(opening.commands.find((command) => command.type === "COUNTDOWN").seconds, 3);
  assert.equal(mode.handleEvent("SHOT_ATTEMPT", { shotId: "too-early" }).accepted, false);
  assert.equal(mode.getState().clock, 60);

  const emitted = [3];
  for (let step = 0; step < 31; step += 1) {
    const response = mode.update(0.1);
    emitted.push(...response.commands
      .filter((command) => command.type === "COUNTDOWN")
      .map((command) => command.seconds));
    if (mode.phase === MODE_PHASES.COUNTDOWN) {
      assert.equal(mode.phase, MODE_PHASES.COUNTDOWN);
      assert.equal(mode.getState().clock, 60);
      if (step % 10 === 9) {
        assert.equal(mode.handleEvent("SHOT_ATTEMPT", { shotId: `early-${step}` }).accepted, false);
      }
    } else {
      break;
    }
  }
  assert.deepEqual(emitted, [3, 2, 1]);
  assert.equal(mode.phase, MODE_PHASES.LIVE);
  assert.equal(mode.getState().clock, 60);
  assert.equal(mode.getState().currentBall.isMoneyBall, false);
  assert.equal(mode.handleEvent("SHOT_ATTEMPT", { shotId: "live-shot" }).accepted, true);

  const restarted = mode.handleEvent("RESTART");
  assert.equal(mode.phase, MODE_PHASES.COUNTDOWN);
  assert.equal(mode.getState().countdown, 3);
  assert.equal(mode.getState().clock, 60);
  assert.equal(restarted.commands.find((command) => command.type === "COUNTDOWN").seconds, 3);
});

test("rack renderer exposes all five racks and consumes the visible ball instances", () => {
  class FakeObject3D {
    constructor() {
      this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
      this.rotation = { x: 0, y: 0 };
      this.scale = { x: 1, y: 1, z: 1, set: (x, y, z) => Object.assign(this.scale, { x, y, z }) };
      this.matrix = {};
    }
    updateMatrix() {
      this.matrix = {
        position: { x: this.position.x, y: this.position.y, z: this.position.z },
        yaw: this.rotation.y,
        pitch: this.rotation.x,
        scale: { x: this.scale.x, y: this.scale.y, z: this.scale.z },
      };
    }
  }
  class FakeGroup extends FakeObject3D {
    constructor() {
      super();
      this.children = [];
    }
    add(...children) {
      this.children.push(...children);
    }
  }
  class FakeInstancedMesh extends FakeObject3D {
    constructor(geometry, material, count) {
      super();
      this.geometry = geometry;
      this.material = material;
      this.count = count;
      this.matrices = [];
      this.instanceMatrix = { needsUpdate: false };
    }
    setMatrixAt(index, matrix) {
      this.matrices[index] = structuredClone(matrix);
    }
  }
  class FakeAsset {
    constructor(...args) {
      this.args = args;
    }
  }
  const T = {
    Object3D: FakeObject3D,
    Group: FakeGroup,
    InstancedMesh: FakeInstancedMesh,
    MeshStandardMaterial: FakeAsset,
    BoxGeometry: FakeAsset,
    SphereGeometry: FakeAsset,
    TorusGeometry: FakeAsset,
  };
  const scene = new FakeGroup();
  const visuals = createThreePointRackVisuals(T, scene);
  assert.deepEqual(visuals.getSnapshot(), {
    rackCount: 5,
    ballCount: 25,
    drawCalls: 11,
    racks: THREE_POINT_RACKS.map((rack) => ({
      id: rack.id,
      ...getThreePointRackPresentation(rack),
    })),
  });
  assert.equal(scene.children[0].name, "three-point-contest-racks");

  visuals.setCurrent(0, 4);
  const normalBalls = visuals.root.children[7];
  const moneyBalls = visuals.root.children[8];
  assert.deepEqual(
    normalBalls.matrices.slice(0, 4).map((matrix) => matrix.scale),
    Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0 })),
  );
  assert.deepEqual(moneyBalls.matrices[0].scale, { x: 1, y: 1, z: 1 });
  const lastBallPlacement = visuals.getBallPlacement(0, 4);
  assert.ok(Number.isFinite(lastBallPlacement.x));
  assert.equal(lastBallPlacement.y, 1.01);
  visuals.takeBall(0, 4);
  assert.deepEqual(moneyBalls.matrices[0].scale, { x: 0, y: 0, z: 0 });

  visuals.setCurrent(1, 0);
  assert.deepEqual(moneyBalls.matrices[0].scale, { x: 0, y: 0, z: 0 });
  visuals.reset();
  assert.deepEqual(normalBalls.matrices[0].scale, { x: 1, y: 1, z: 1 });

  const topNormal = visuals.getBallPlacement(2, 0);
  const topMoney = visuals.getBallPlacement(2, 4);
  const topPresentation = getThreePointRackPresentation(THREE_POINT_RACKS[2]);
  assert.ok(Math.abs(topNormal.x - topMoney.x) < 1e-12, "top rack is vertical in court coordinates");
  assert.ok(topNormal.z < topMoney.z, "normal ball is at the hoop/top end");
  assert.ok(
    Math.hypot(topNormal.x, topNormal.z + 5.7)
      < Math.hypot(topMoney.x, topMoney.z + 5.7),
    "money ball is at the down-court/bottom end",
  );
  assert.ok(
    Math.abs(visuals.root.children[0].matrices[2].yaw - topPresentation.visualYaw) < 1e-12,
    "top rack mesh uses the radial visual yaw",
  );
  for (let rackIndex = 0; rackIndex < THREE_POINT_RACKS.length; rackIndex += 1) {
    const first = visuals.getBallPlacement(rackIndex, 0);
    const money = visuals.getBallPlacement(rackIndex, 4);
    assert.ok(
      Math.hypot(first.x, first.z + 5.7) < Math.hypot(money.x, money.z + 5.7),
      `${THREE_POINT_RACKS[rackIndex].id} keeps normal ball at hoop/top end`,
    );
  }
});

test("Arc Run integration wires rack placement, locked camera, and arbitrary QA jumps", async () => {
  const [appSource, engineSource] = await Promise.all([
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
    readFile(new URL("../js/engine.js", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /setCameraMode\(currentModeKey === "threePoint"[\s\S]*\? "arc-run"/);
  assert.match(appSource, /engine\.setArcRunRack\?\.\(rack\)/);
  assert.match(appSource, /jumpThreePointContest:\s*\(rackIndex = 0, ballIndex = 0/);
  assert.match(appSource, /setArcRunCountdown/);
  assert.match(appSource, /setArcRunGrab/);
  assert.match(appSource, /beginArcRunGrab/);
  assert.match(appSource, /arc-run-countdown/);
  assert.match(appSource, /snapThreePointCamera/);
  assert.match(appSource, /facingHoopDot/);
  assert.match(engineSource, /createArcRunCameraSnapshot/);
  assert.match(engineSource, /if \(this\.cameraMode === "arc-run"\)/);
  assert.match(engineSource, /if \(this\.cameraMode === "arc-run"\) return "arc-run"/);
  assert.match(engineSource, /snapArcRunCameraForQA\(\)/);
  assert.match(engineSource, /setArcRunGrabProgressForQA/);
  assert.match(engineSource, /sampleArcRunGrab/);
  assert.match(engineSource, /1 - Math\.exp\(-4\.2 \* dt\)/);
});

test("settling every attempt automatically advances balls and all five racks", () => {
  const { mode, live } = startLive();
  const rules = mode.getRules();
  const opening = live.commands.find((command) => command.type === "SPAWN_RACK_BALL");
  assert.deepEqual(
    {
      rackIndex: opening.rackIndex,
      ballIndex: opening.ballIndex,
      sequenceIndex: opening.sequenceIndex,
      value: opening.value,
      isMoneyBall: opening.isMoneyBall,
      ballStyle: opening.ballStyle,
    },
    {
      rackIndex: 0,
      ballIndex: 0,
      sequenceIndex: 0,
      value: 1,
      isMoneyBall: false,
      ballStyle: "classic",
    },
  );

  for (let index = 0; index < rules.totalBalls; index += 1) {
    const before = mode.getState();
    assert.equal(before.sequenceIndex, index);
    const shotId = `shot-${index}`;
    const attempt = mode.handleEvent("SHOT_ATTEMPT", { shotId });
    assert.equal(attempt.accepted, true);
    assert.ok(attempt.commands.some((command) =>
      command.type === "LOCK_RACK_BALL"
      && command.sequenceIndex === index));

    const made = index % 2 === 0;
    const settled = mode.handleEvent(made ? "BASKET" : "MISS", { shotId });
    const resolution = settled.commands.find(
      (command) => command.type === "CONTEST_SHOT_RESOLVED",
    );
    assert.equal(resolution.sequenceIndex, index);
    assert.equal(resolution.made, made);
    assert.equal(resolution.ballStyle, rules.ballSequence[index].ballStyle);

    if (index < rules.totalBalls - 1) {
      const next = settled.commands.find((command) => command.type === "SPAWN_RACK_BALL");
      assert.equal(next.sequenceIndex, index + 1);
      assert.equal(next.rackIndex, Math.floor((index + 1) / rules.ballsPerRack));
      assert.equal(next.ballIndex, (index + 1) % rules.ballsPerRack);
      if ((index + 1) % rules.ballsPerRack === 0) {
        assert.ok(settled.commands.some((command) =>
          command.type === "MOVE_TO_RACK"
          && command.rackIndex === next.rackIndex));
      }
    }
  }

  const complete = mode.getState();
  assert.equal(complete.phase, MODE_PHASES.FINISHED);
  assert.equal(complete.attempts, 25);
  assert.equal(complete.makes, 13);
  assert.deepEqual(complete.rackStats.map((rack) => rack.attempts), [5, 5, 5, 5, 5]);
  assert.deepEqual(complete.rackStats.map((rack) => rack.makes), [3, 2, 3, 2, 3]);
  assert.deepEqual(complete.finishedRacks, [0, 1, 2, 3, 4]);
  assert.equal(complete.result.reason, "all_racks");
  assert.equal(mode.getUIState().complete, true);
  assert.equal(mode.getUIState().rackLabel, "Complete");
  assert.equal(mode.getUIState().sequenceProgress, "25/25");
});

test("all makes score 30 with five explicit two-point money balls", () => {
  const { mode } = startLive();
  for (let index = 0; index < 25; index += 1) {
    const shotId = `make-${index}`;
    mode.handleEvent("SHOT_ATTEMPT", { shotId });
    mode.handleEvent("BASKET", { shotId });
  }
  const state = mode.getState();
  assert.equal(state.score, 30);
  assert.equal(state.makes, 25);
  assert.equal(state.moneyBallMakes, 5);
  assert.equal(mode.getRules().maximumScore, 30);
});

test("unresolved attempts settle as misses and stale outcomes cannot score the next ball", () => {
  const { mode } = startLive({ shotResolveTimeout: 0.2 });
  mode.handleEvent("SHOT_ATTEMPT", { shotId: "old-shot" });
  let timeoutCommands = [];
  for (let index = 0; index < 3; index += 1) {
    timeoutCommands = timeoutCommands.concat(mode.update(0.1).commands);
  }
  assert.equal(mode.getState().attempts, 1);
  assert.equal(mode.getState().sequenceIndex, 1);
  assert.ok(timeoutCommands.some((command) =>
    command.type === "CONTEST_SHOT_RESOLVED"
    && command.shotId === "old-shot"
    && command.made === false));

  mode.handleEvent("SHOT_ATTEMPT", { shotId: "current-shot" });
  const stale = mode.handleEvent("BASKET", { shotId: "old-shot" });
  assert.equal(stale.accepted, false);
  assert.equal(mode.getState().score, 0);
  assert.equal(mode.getState().pendingShot.shotId, "current-shot");
  mode.handleEvent("MISS", { shotId: "current-shot" });
  assert.equal(mode.getState().attempts, 2);
  assert.equal(mode.getState().sequenceIndex, 2);
});

test("restart restores counters, rack zero, ball zero, and the classic game ball", () => {
  const { mode } = startLive();
  for (let index = 0; index < 7; index += 1) {
    const shotId = `pre-reset-${index}`;
    mode.handleEvent("SHOT_ATTEMPT", { shotId });
    mode.handleEvent(index === 4 ? "BASKET" : "MISS", { shotId });
  }
  assert.equal(mode.getState().rackIndex, 1);
  assert.equal(mode.getState().ballIndex, 2);

  const restarted = mode.handleEvent("RESTART");
  assert.equal(restarted.accepted, true);
  assert.equal(mode.phase, MODE_PHASES.COUNTDOWN);
  assert.equal(mode.getState().score, 0);
  assert.equal(mode.getState().attempts, 0);
  assert.equal(mode.getState().rackIndex, 0);
  assert.equal(mode.getState().ballIndex, 0);
  assert.equal(mode.getState().sequenceIndex, 0);
  assert.ok(restarted.commands.some((command) =>
    command.type === "PLACE_PLAYER"
    && command.position.id === "left_corner"));

  const liveAgain = mode.update(0.02);
  const ball = liveAgain.commands.find((command) => command.type === "SPAWN_RACK_BALL");
  assert.equal(ball.sequenceIndex, 0);
  assert.equal(ball.ballStyle, THREE_POINT_NORMAL_BALL_STYLE);
  assert.equal(ball.value, THREE_POINT_NORMAL_BALL_POINTS);
});
