import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTEXTUAL_I_ACTIONS,
} from "../js/finishing-mechanics.js";
import {
  NovaCourtEngine,
} from "../js/engine.js";

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.set(x, y, z);
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  setY(y) {
    this.y = y;
    return this;
  }

  copy(other) {
    return this.set(other.x, other.y, other.z);
  }

  clone() {
    return new Vector3(this.x, this.y, this.z);
  }

  subVectors(a, b) {
    return this.set(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  distanceTo(other) {
    return Math.hypot(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  normalize() {
    const length = Math.hypot(this.x, this.y, this.z);
    if (length > 1e-9) this.set(this.x / length, this.y / length, this.z / length);
    return this;
  }

  dot(other) {
    return this.x * other.x + this.y * other.y + this.z * other.z;
  }

  multiplyScalar(scale) {
    return this.set(this.x * scale, this.y * scale, this.z * scale);
  }
}

function sequenceRandom(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function makePlayer({
  id,
  team,
  x,
  z,
  controlled = false,
  isAI = !controlled,
  steal = 0.76,
  ballSecurity = 0.72,
} = {}) {
  return {
    id,
    team,
    controlled,
    isAI,
    root: { position: new Vector3(x, 0, z) },
    velocity: new Vector3(),
    desiredVelocity: new Vector3(),
    facing: new Vector3(1, 0, 0),
    metadata: {
      steal,
      ballSecurity,
      handle: 0.74,
      balance: 0.72,
      discipline: 0.76,
    },
    stamina: 1,
    height: 1.9,
    stealCooldown: 0,
    actionLock: 0,
    dribbleMove: null,
    dribbleMoveTime: 0,
    dribbleMoveProgress: 0,
    hasBall: false,
    setState() {},
  };
}

function makeStealHarness({
  rolls = [1, 1, 0],
  userControlled = true,
} = {}) {
  const defender = makePlayer({
    id: userControlled ? "ace" : "cpu-defender",
    team: "home",
    x: 0,
    z: 0,
    controlled: userControlled,
    isAI: !userControlled,
  });
  const owner = makePlayer({
    id: "handler",
    team: "away",
    x: 0.72,
    z: 0,
    controlled: false,
    isAI: true,
    ballSecurity: 0.68,
  });
  owner.hasBall = true;
  const events = [];
  const ball = {
    owner,
    lastOwner: owner,
    position: new Vector3(0.42, 0.64, 0),
    velocity: new Vector3(),
    angularVelocity: new Vector3(),
    state: "held",
    pickupCooldown: 0,
    lastTouchedTeamId: owner.team,
    lastTouchedPlayerId: owner.id,
  };
  const engine = {
    T: { Vector3 },
    difficulty: "pro",
    controlledPlayer: userControlled ? defender : null,
    possessionTeam: owner.team,
    ball,
    events: {
      emit(type, detail) {
        events.push({ ...detail, channel: type });
      },
    },
    controls: {
      wasPressed: (action) => action === "steal",
      rumble() {},
    },
    random: sequenceRandom(rolls),
    teamFouls: { home: 0, away: 0 },
    deadBallCooldown: 0,
    cameraShake: 0,
    releaseBall(position, velocity, state) {
      const previousOwner = ball.owner;
      if (previousOwner) previousOwner.hasBall = false;
      ball.lastOwner = previousOwner || ball.lastOwner;
      ball.owner = null;
      ball.state = state;
      ball.position.copy(position);
      ball.velocity.copy(velocity);
      ball.pickupCooldown = 0.16;
    },
    _difficultyValue: NovaCourtEngine.prototype._difficultyValue,
    _burst() {},
    attemptSteal: NovaCourtEngine.prototype.attemptSteal,
  };
  return { engine, defender, owner, ball, events };
}

test("controlled steal input invokes exactly one user attempt", () => {
  const { engine, defender } = makeStealHarness();
  let attempts = 0;
  engine.attemptSteal = (player, options) => {
    attempts += 1;
    assert.equal(player, defender);
    assert.equal(options.source, "user");
    return true;
  };

  const handled = NovaCourtEngine.prototype._handleControlledStealInput.call(
    engine,
    defender,
    { action: CONTEXTUAL_I_ACTIONS.STEAL },
  );

  assert.equal(handled, true);
  assert.equal(attempts, 1);
});

test("successful clean user steal dislodges owner into a recoverable loose-ball roll", () => {
  const { engine, defender, owner, ball, events } = makeStealHarness({
    rolls: [1, 1, 0],
  });

  const success = engine.attemptSteal(defender, { source: "user" });

  assert.equal(success, true);
  assert.equal(owner.hasBall, false);
  assert.equal(ball.owner, null);
  assert.equal(ball.state, "loose");
  assert.ok(ball.pickupCooldown > 0 && ball.pickupCooldown < 0.3);
  assert.ok(Math.hypot(ball.velocity.x, ball.velocity.z) > 1);
  assert.ok([ball.velocity.x, ball.velocity.y, ball.velocity.z].every(Number.isFinite));
  assert.equal(ball.lastTouchedPlayerId, owner.id);
  assert.equal(ball.lastTouchedTeamId, owner.team);
  assert.ok(events.some((event) =>
    event.channel === "ballloose" && event.defender === defender && event.victim === owner));
});

test("missed and foul user reaches leave possession with the handler", () => {
  for (const [label, rolls] of [
    ["miss", [1, 1, 1]],
    ["foul", [0, 1, 1]],
  ]) {
    const { engine, defender, owner, ball, events } = makeStealHarness({ rolls });
    if (label === "foul") {
      defender.root.position.set(0.25, 0, 0);
      defender.facing.set(-1, 0, 0);
    }
    const success = engine.attemptSteal(defender, { source: "user" });

    assert.equal(success, false, label);
    assert.equal(ball.owner, owner, label);
    assert.equal(owner.hasBall, true, label);
    assert.equal(ball.state, "held", label);
    if (label === "foul") {
      assert.ok(events.some((event) => event.channel === "foul"), label);
    }
  }
});

test("steal cooldown rejects input spam without resolving a second duel", () => {
  const { engine, defender, events } = makeStealHarness({
    rolls: [1, 1, 1],
  });

  engine.attemptSteal(defender, { source: "user" });
  const firstEventCount = events.filter((event) => event.channel === "steal").length;
  const repeated = engine.attemptSteal(defender, { source: "user" });

  assert.equal(repeated, false);
  assert.equal(firstEventCount, 1);
  assert.equal(events.filter((event) => event.channel === "steal").length, 1);
  assert.ok(defender.stealCooldown > 0);
});

test("CPU steal resolution keeps the same loose-ball contract", () => {
  const { engine, defender, owner, ball } = makeStealHarness({
    rolls: [1, 1, 0],
    userControlled: false,
  });

  const success = engine.attemptSteal(defender, { source: "cpu" });

  assert.equal(success, true);
  assert.equal(owner.hasBall, false);
  assert.equal(ball.owner, null);
  assert.equal(ball.state, "loose");
});
