import test from "node:test";
import assert from "node:assert/strict";
import { createGameMode, MODE_IDS, MODE_PHASES } from "../js/modes.js";
import {
  THREE_POINT_BALLS_PER_RACK,
  THREE_POINT_MONEY_BALL_POINTS,
  THREE_POINT_MONEY_BALL_STYLE,
  THREE_POINT_NORMAL_BALL_POINTS,
  THREE_POINT_NORMAL_BALL_STYLE,
  THREE_POINT_RACKS,
  contestRackDistance,
  createContestBallSequence,
  createThreePointRackVisuals,
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

test("five authored rack spots follow a symmetric regulation-distance arc", () => {
  assert.equal(THREE_POINT_RACKS.length, 5);
  assert.deepEqual(
    THREE_POINT_RACKS.map((rack) => rack.id),
    ["left_corner", "left_wing", "top", "right_wing", "right_corner"],
  );
  for (const rack of THREE_POINT_RACKS) {
    assert.ok(contestRackDistance(rack) >= 6.35, `${rack.id} must be behind the arc`);
    assert.ok(Math.abs(rack.x) < 7.5, `${rack.id} must remain on court`);
    assert.ok(Math.abs(rack.z) < 7, `${rack.id} must remain on court`);
  }
  assert.equal(THREE_POINT_RACKS[0].x, -THREE_POINT_RACKS[4].x);
  assert.equal(THREE_POINT_RACKS[0].z, THREE_POINT_RACKS[4].z);
  assert.equal(THREE_POINT_RACKS[1].x, -THREE_POINT_RACKS[3].x);
  assert.equal(THREE_POINT_RACKS[1].z, THREE_POINT_RACKS[3].z);
  assert.equal(THREE_POINT_RACKS[2].x, 0);
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

test("rack renderer exposes all five racks and consumes the visible ball instances", () => {
  class FakeObject3D {
    constructor() {
      this.position = { x: 0, y: 0, z: 0, set: (x, y, z) => Object.assign(this.position, { x, y, z }) };
      this.rotation = { y: 0 };
      this.scale = { x: 1, y: 1, z: 1, set: (x, y, z) => Object.assign(this.scale, { x, y, z }) };
      this.matrix = {};
    }
    updateMatrix() {
      this.matrix = {
        position: { x: this.position.x, y: this.position.y, z: this.position.z },
        yaw: this.rotation.y,
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
    drawCalls: 8,
  });
  assert.equal(scene.children[0].name, "three-point-contest-racks");

  visuals.setCurrent(0, 4);
  const normalBalls = visuals.root.children[4];
  const moneyBalls = visuals.root.children[5];
  assert.deepEqual(
    normalBalls.matrices.slice(0, 4).map((matrix) => matrix.scale),
    Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0 })),
  );
  assert.deepEqual(moneyBalls.matrices[0].scale, { x: 1, y: 1, z: 1 });

  visuals.setCurrent(1, 0);
  assert.deepEqual(moneyBalls.matrices[0].scale, { x: 0, y: 0, z: 0 });
  visuals.reset();
  assert.deepEqual(normalBalls.matrices[0].scale, { x: 1, y: 1, z: 1 });
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
