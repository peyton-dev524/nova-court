import test from "node:test";
import assert from "node:assert/strict";

import {
  BufferedInputQueue,
  CONTROLLER_FAMILIES,
  DEFENSIVE_ACTIONS,
  DefensiveControlSystem,
  InputDeviceManager,
  OFF_BALL_COMMANDS,
  POST_ACTIONS,
  QUICK_TACTICS,
  TRIPLE_THREAT_ACTIONS,
  TacticalRadialMenu,
  VIBRATION_PATTERNS,
  VibrationManager,
  calculateOffBallGradeImpact,
  compileVibrationPattern,
  createTacticRadialLayout,
  detectControllerFamily,
  resolveOffBallCommand,
  resolvePostAction,
  resolveTripleThreatAction,
  selectSafeTeammate,
  selectTacticFromRadial,
  validatePostContext,
  validateTripleThreatContext,
} from "../js/interaction-systems.js";

const offense = {
  id: "home-wing",
  teamId: "home",
  active: true,
  hasBall: true,
  ballState: "held",
  hasDribbled: false,
  grounded: true,
  velocity: { x: 0, z: 0 },
  position: { x: 0, z: 2.2 },
  postEngaged: true,
  strength: 0.82,
  balance: 0.78,
  height: 2.03,
  stamina: 0.84,
  dominantHand: "right",
  weakHand: 0.58,
  footwork: 0.8,
};

const defense = {
  id: "away-big",
  teamId: "away",
  active: true,
  grounded: true,
  position: { x: 0.7, z: 2.2 },
  strength: 0.7,
  balance: 0.7,
  height: 1.96,
  stamina: 0.78,
  discipline: 0.8,
  perimeterDefense: 0.78,
};

test("compact context radial exposes every tactic and produces a visible confirmation", () => {
  const offenseLayout = createTacticRadialLayout("offense");
  const defenseLayout = createTacticRadialLayout("defense");
  assert.equal(offenseLayout.compact, true);
  assert.ok(offenseLayout.diameter <= 192);
  assert.deepEqual(
    [...offenseLayout.items, ...defenseLayout.items].map((item) => item.id).sort(),
    QUICK_TACTICS.map((item) => item.id).sort(),
  );
  const picked = selectTacticFromRadial(offenseLayout, { x: 0, y: -1 });
  assert.equal(picked.id, "clear_out");

  const menu = new TacticalRadialMenu({ confirmationMs: 1000 });
  menu.open("offense", 100);
  menu.point({ x: 0, y: -1 }, 110);
  const result = menu.confirm(120);
  assert.equal(result.accepted, true);
  assert.equal(result.command.type, "SET_TEAM_TACTIC");
  assert.match(menu.getSnapshot(500).confirmation.message, /Clear out called/);
  assert.equal(menu.getSnapshot(1120).confirmation, null);
});

test("all off-ball contributions validate ownership and have bounded grade effects", () => {
  const actor = { ...offense, id: "home-cutter", hasBall: false, position: { x: 3, z: 1 } };
  const handler = { ...offense, id: "home-handler", position: { x: 0, z: 3 } };
  for (const command of OFF_BALL_COMMANDS) {
    const result = resolveOffBallCommand({
      command: command.id,
      actor,
      ballHandler: handler,
      defender: defense,
      basket: { x: 0, z: -6 },
      now: 10,
    });
    assert.equal(result.accepted, true, command.id);
    assert.equal(result.commands[0].playerId, actor.id);
  }
  assert.equal(resolveOffBallCommand({ command: "cut", actor: handler, ballHandler: handler }).accepted, false);
  assert.ok(calculateOffBallGradeImpact("screen_assist").delta > 0);
  assert.ok(calculateOffBallGradeImpact("clogged_lane").delta < 0);
  assert.ok(calculateOffBallGradeImpact("good_cut", { repetitions: 5 }).delta
    < calculateOffBallGradeImpact("good_cut").delta);
});

test("teammate switching is cooldown-safe, filters unavailable players, and honors direction", () => {
  const players = [
    { id: "a", teamId: "home", position: { x: 0, z: 0 } },
    { id: "left", teamId: "home", position: { x: -3, z: 0 } },
    { id: "right", teamId: "home", position: { x: 3, z: 0 } },
    { id: "hurt", teamId: "home", active: false, position: { x: 4, z: 0 } },
    { id: "opponent", teamId: "away", position: { x: 5, z: 0 } },
  ];
  const switched = selectSafeTeammate({
    currentPlayerId: "a",
    players,
    direction: { x: 1, z: 0 },
    now: 1000,
    lastSwitchAt: 0,
  });
  assert.equal(switched.accepted, true);
  assert.equal(switched.playerId, "right");
  assert.equal(selectSafeTeammate({ ...switched, currentPlayerId: "right", players, now: 1100, lastSwitchAt: 1000 }).reason, "switch_cooldown");
});

test("expanded defense is effective without steal and repeated reaches escalate risk", () => {
  assert.deepEqual(DEFENSIVE_ACTIONS.filter((action) => action.id !== "steal").map((action) => action.id), [
    "hands_up", "intense", "ground_contest", "vertical_contest", "take_charge", "box_out",
    "deny_pass", "shade_left", "shade_right", "double_team", "controlled_slide",
  ]);
  const system = new DefensiveControlSystem();
  const matchup = { alignment: 0.9, distance: 0.8 };
  const ground = system.perform({ action: "ground_contest", defender: defense, matchup, now: 0 });
  const firstReach = system.perform({ action: "steal", defender: defense, matchup, now: 100 });
  system.perform({ action: "steal", defender: defense, matchup, now: 200 });
  const thirdReach = system.perform({ action: "steal", defender: defense, matchup, now: 300 });
  const fourthReach = system.perform({ action: "steal", defender: defense, matchup, now: 400 });
  assert.ok(ground.effectiveness > 0.65);
  assert.ok(ground.foulRisk < 0.05);
  assert.equal(firstReach.spamPenalty, 0);
  assert.ok(thirdReach.spamPenalty > firstReach.spamPenalty);
  assert.ok(fourthReach.foulRisk > firstReach.foulRisk + 0.2);
  assert.ok(fourthReach.exposure > ground.exposure);
});

test("triple threat is planted, preserves a pivot, and validates committed step-throughs", () => {
  assert.equal(TRIPLE_THREAT_ACTIONS.length, 8);
  assert.equal(validateTripleThreatContext({ action: "jab_step", player: offense }).valid, true);
  assert.equal(validateTripleThreatContext({
    action: "jab_step",
    player: { ...offense, velocity: { x: 0.4, z: 0 } },
  }).reason, "not_planted");
  assert.equal(validateTripleThreatContext({ action: "jab_step", player: { ...offense, hasDribbled: true } }).reason, "dribble_already_used");
  assert.equal(resolveTripleThreatAction({ action: "step_through", player: offense, defender: defense }).executed, false);
  const stepThrough = resolveTripleThreatAction({
    action: "step_through",
    player: { ...offense, previousAction: "pump_fake", pivotFoot: "right" },
    defender: { ...defense, airborne: true },
  });
  assert.equal(stepThrough.executed, true);
  assert.equal(stepThrough.pivotFoot, "right");
  assert.equal(stepThrough.keepsPivot, true);
  assert.equal(resolveTripleThreatAction({ action: "explosive_first_step", player: offense }).startsDribble, true);
});

test("every post action validates contact and strength, balance, size, stamina, hand, angle, and position matter", () => {
  assert.equal(POST_ACTIONS.length, 10);
  assert.equal(validatePostContext({
    action: "drop_step",
    offense: { ...offense, position: { x: 0, z: 0 } },
    defense: { ...defense, position: { x: 5, z: 0 } },
    basket: { x: 0, z: -1 },
  }).reason, "no_post_contact");

  const strong = resolvePostAction({
    action: "drop_step",
    offense,
    defense,
    basket: { x: 0, z: 0 },
    context: { finishHand: "right", attackAngle: 1, defenderPositionQuality: 0.2 },
    roll: 0.5,
  });
  const weak = resolvePostAction({
    action: "drop_step",
    offense: { ...offense, strength: 0.3, balance: 0.35, height: 1.78, stamina: 0.25 },
    defense: { ...defense, strength: 0.9, balance: 0.9, height: 2.12, stamina: 0.95 },
    basket: { x: 0, z: 0 },
    context: { finishHand: "left", attackAngle: -1, defenderPositionQuality: 0.95 },
    roll: 0.5,
  });
  assert.equal(strong.resolved, true);
  assert.ok(strong.probability > weak.probability + 0.3);
  assert.ok(strong.contributions.strengthEdge > weak.contributions.strengthEdge);
  assert.ok(strong.contributions.balanceEdge > weak.contributions.balanceEdge);
  assert.ok(strong.contributions.heightEdge > weak.contributions.heightEdge);
  assert.ok(strong.contributions.staminaEdge > weak.contributions.staminaEdge);
  assert.ok(strong.contributions.handAdvantage > weak.contributions.handAdvantage);
  assert.ok(strong.contributions.angleAdvantage > weak.contributions.angleAdvantage);
  assert.ok(strong.contributions.defensePosition < weak.contributions.defensePosition);
});

test("input queue prioritizes urgent corrections, measures latency, and bounds stale inputs", () => {
  const buffer = new BufferedInputQueue({ targetLatencyMs: 50 });
  buffer.enqueue("movement", { x: 1 }, { inputAt: 0, receivedAt: 2 });
  buffer.enqueue("pass", { target: "wing" }, { inputAt: 4, receivedAt: 5 });
  const pass = buffer.consume({
    now: 12,
    currentAction: { category: "dribble", lockedUntil: 200 },
  });
  assert.equal(pass.action, "pass");
  assert.equal(pass.interrupted, true);
  assert.equal(pass.latencyMs, 8);
  assert.equal(pass.withinTarget, true);
  buffer.enqueue("shoot", {}, { inputAt: 20 });
  const blocked = buffer.consume({
    now: 25,
    currentAction: { category: "non_interruptible_finish", lockedUntil: 200 },
  });
  assert.equal(blocked.consumed, false);
  buffer.enqueue("pause", {}, { inputAt: 26 });
  assert.equal(buffer.consume({ now: 27, currentAction: { category: "finish", lockedUntil: 200 } }).action, "pause");
  buffer.consume({ now: 500 });
  const metrics = buffer.getMetrics();
  assert.equal(metrics.samples, 2);
  assert.ok(metrics.averageLatencyMs < metrics.targetLatencyMs);
  assert.ok(metrics.droppedExpired >= 1);
});

test("controller family, prompts, disconnect/reconnect, and assignments switch immediately", () => {
  assert.equal(detectControllerFamily("Xbox Wireless Controller"), CONTROLLER_FAMILIES.XBOX);
  assert.equal(detectControllerFamily("DualSense Wireless Controller"), CONTROLLER_FAMILIES.PLAYSTATION);
  assert.equal(detectControllerFamily("USB Gamepad"), CONTROLLER_FAMILIES.GENERIC);

  const devices = new InputDeviceManager({ keyboardBindings: { shoot: ["KeyK"] } });
  devices.connect({ index: 0, id: "Xbox Wireless Controller", mapping: "standard" }, 10);
  devices.connect({ index: 1, id: "DualSense Wireless Controller", mapping: "standard" }, 11);
  assert.equal(devices.assign("gamepad:0", "player-one").assigned, true);
  assert.equal(devices.assign("gamepad:1", "player-two").assigned, true);
  devices.recordControllerActivity(1, 12);
  assert.deepEqual(devices.getPrompt("shoot"), { family: "playstation", action: "shoot", label: "Square" });
  const disconnected = devices.disconnect(1, 13);
  assert.match(disconnected.warning.message, /disconnected/);
  assert.equal(devices.getSnapshot().promptMode, "keyboard");
  assert.equal(devices.getPrompt("shoot").label, "KeyK");
  devices.connect({ index: 1, id: "DualSense Wireless Controller" }, 14);
  assert.equal(devices.getSnapshot().assignments.find((item) => item.deviceId === "gamepad:1").playerId, "player-two");
  assert.ok(devices.drainEvents().some((event) => event.type === "controller_reconnected"));
});

test("vibration patterns are distinct, adjustable, disableable, and cooldown bounded", () => {
  for (const id of ["dribble", "collision", "hard_rim", "perfect_release", "low_stamina", "block", "game_point"]) {
    assert.ok(VIBRATION_PATTERNS[id].segments.length >= 1, id);
  }
  const full = compileVibrationPattern("collision", { strength: 1 });
  const quarter = compileVibrationPattern("collision", { strength: 0.25 });
  assert.equal(quarter[0].strongMagnitude, full[0].strongMagnitude * 0.25);
  assert.deepEqual(compileVibrationPattern("collision", { enabled: false }), []);

  const calls = [];
  const actuator = { playEffect: (type, effect) => { calls.push({ type, effect }); return Promise.resolve(); } };
  const vibration = new VibrationManager({ strength: 0.5 });
  const played = vibration.trigger("low_stamina", actuator, { now: 1000 });
  assert.equal(played.played, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.effect.strongMagnitude <= 0.5));
  assert.equal(vibration.trigger("low_stamina", actuator, { now: 1100 }).reason, "cooldown");
  vibration.configure({ enabled: false });
  assert.equal(vibration.trigger("block", actuator, { now: 2000 }).played, false);
});
