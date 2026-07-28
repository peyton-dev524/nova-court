import test from "node:test";
import assert from "node:assert/strict";

import {
  PRESENTATION_BUDGET,
  TUTORIAL_STEPS,
  assessPresentationBudget,
  createPresentationDirector,
} from "../js/presentation-director.js";

class Vector {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  normalize() {
    const length = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= length; this.y /= length; this.z /= length;
    return this;
  }
  multiplyScalar(value) { this.x *= value; this.y *= value; this.z *= value; return this; }
  clone() { return new Vector(this.x, this.y, this.z); }
  add(value) { this.x += value.x; this.y += value.y; this.z += value.z; return this; }
}

function createFakeEngine() {
  const actions = [];
  const players = Array.from({ length: 4 }, (_, index) => ({
    id: `bot-${index}`,
    team: index < 2 ? "home" : "away",
    root: { position: new Vector(), rotation: { y: 0 } },
    facing: new Vector(0, 0, -1),
    desiredVelocity: new Vector(),
    velocity: new Vector(),
    setState(state) { actions.push(`state:${state}`); },
  }));
  const engine = {
    players,
    ball: { pickupCooldown: 0 },
    _scratchA: new Vector(),
    setCameraMode(mode) { actions.push(`camera:${mode}`); },
    givePossession(player) {
      for (const candidate of players) candidate.hasBall = candidate === player;
      this.ball.owner = player;
      actions.push(`possession:${player.id}`);
      return true;
    },
    performDribbleMove() { actions.push("dribble"); return true; },
    pass(player, target) {
      player.hasBall = false;
      target.hasBall = true;
      this.ball.owner = target;
      actions.push("pass");
      return true;
    },
    releaseBall() {
      for (const player of players) player.hasBall = false;
      this.ball.owner = null;
      actions.push("steal");
      return true;
    },
    shoot(player, quality, context) {
      player.hasBall = false;
      this.ball.owner = null;
      actions.push(`shoot:${context}`);
      return true;
    },
    _basketForTeam() { return { x: 0, z: -5.7, attackSign: -1 }; },
  };
  engine.givePossession(players[0]);
  return { engine, actions };
}

test("guided bot tutorial demonstrates every requested action and never writes rewards", () => {
  const { engine, actions } = createFakeEngine();
  const shownSteps = [];
  let completed = 0;
  const director = createPresentationDirector(engine, {
    tutorial: true,
    onStep: (step) => shownSteps.push(step.id),
    onComplete: () => { completed += 1; },
  });
  for (let frame = 0; frame < 520; frame += 1) director.update(0.05);
  const snapshot = director.getSnapshot();
  assert.deepEqual(shownSteps, TUTORIAL_STEPS.map((step) => step.id));
  assert.equal(completed, 1);
  assert.equal(snapshot.active, false);
  assert.equal(snapshot.rewardWrites, 0);
  assert.ok(actions.includes("dribble"));
  assert.ok(actions.includes("pass"));
  assert.ok(actions.includes("steal"));
  assert.ok(actions.includes("shoot:jumper"));
  assert.ok(actions.includes("shoot:layup"));
});

test("attract mode loops within the procedural presentation budget", () => {
  const { engine } = createFakeEngine();
  const director = createPresentationDirector(engine, { loop: true });
  for (let frame = 0; frame < 400; frame += 1) director.update(0.05);
  const snapshot = director.getSnapshot();
  assert.equal(snapshot.tutorial, false);
  assert.equal(snapshot.active, true);
  assert.ok(snapshot.loops >= 1);
  assert.equal(PRESENTATION_BUDGET.maximumPlayers, 3);
  assert.equal(PRESENTATION_BUDGET.maximumCrowdDrawCalls, 2);
  assert.equal(PRESENTATION_BUDGET.externalAssetBytes, 0);
  assert.equal(snapshot.rewardWrites, 0);
  assert.equal(assessPresentationBudget({
    calls: 120,
    triangles: 25494,
    geometries: 178,
    textures: 9,
  }).withinBudget, true);
  assert.deepEqual(assessPresentationBudget({ calls: 141 }).violations, ["calls"]);
});
