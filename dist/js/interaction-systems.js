/**
 * Deterministic interaction foundations for Nova Court.
 *
 * This module deliberately has no DOM, Three.js, navigator, timer, or random
 * dependency. Runtime adapters provide timestamps, gamepad snapshots, actuators,
 * and outcome rolls; the systems return immutable commands that the engine can
 * apply on its next simulation step.
 */

export const INTERACTION_SYSTEMS_VERSION = "1.0.0";

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const finite = (value, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const rating = (value, fallback = 0.68) => {
  const result = finite(value, fallback);
  return clamp(result > 1 ? result / 100 : result);
};
const point = (value) => ({ x: finite(value?.x), z: finite(value?.z) });
const distance = (a, b) => Math.hypot(
  finite(a?.x) - finite(b?.x),
  finite(a?.z) - finite(b?.z),
);
const magnitude = (value) => Math.hypot(finite(value?.x), finite(value?.z));
const normalize = (value) => {
  const length = magnitude(value);
  return length > 1e-6
    ? Object.freeze({ x: finite(value?.x) / length, z: finite(value?.z) / length })
    : Object.freeze({ x: 0, z: 0 });
};
const dot = (a, b) => finite(a?.x) * finite(b?.x) + finite(a?.z) * finite(b?.z);
const freezeArray = (items) => Object.freeze(items.map((item) => Object.freeze({ ...item })));
const idOf = (value) => String(value ?? "").trim().toLowerCase().replaceAll("-", "_");

// ---------------------------------------------------------------------------
// Quick tactics and compact radial presentation

export const TACTIC_CONTEXTS = Object.freeze({
  OFFENSE: "offense",
  DEFENSE: "defense",
});

export const QUICK_TACTICS = freezeArray([
  { id: "clear_out", label: "Clear out", context: "offense", durationMs: 5000 },
  { id: "set_screen", label: "Set screen", context: "offense", durationMs: 4200 },
  { id: "cut_to_basket", label: "Cut to basket", context: "offense", durationMs: 3200 },
  { id: "space_floor", label: "Space the floor", context: "offense", durationMs: 6000 },
  { id: "push_pace", label: "Push the pace", context: "offense", durationMs: 7000 },
  { id: "slow_game", label: "Slow the game", context: "offense", durationMs: 7000 },
  { id: "protect_paint", label: "Protect the paint", context: "defense", durationMs: 6000 },
  { id: "switch_everything", label: "Switch everything", context: "defense", durationMs: 6000 },
  { id: "no_threes", label: "No threes", context: "defense", durationMs: 6000 },
  { id: "play_tight", label: "Play tight", context: "defense", durationMs: 6000 },
]);

export function createTacticRadialLayout(context = TACTIC_CONTEXTS.OFFENSE, options = {}) {
  const normalizedContext = idOf(context) === TACTIC_CONTEXTS.DEFENSE
    ? TACTIC_CONTEXTS.DEFENSE
    : TACTIC_CONTEXTS.OFFENSE;
  const radius = clamp(finite(options.radius, 58), 42, 72);
  const diameter = clamp(finite(options.diameter, 168), 144, 192);
  const commands = QUICK_TACTICS.filter((command) => command.context === normalizedContext);
  const step = Math.PI * 2 / commands.length;
  const start = -Math.PI / 2;
  return Object.freeze({
    context: normalizedContext,
    compact: true,
    diameter,
    deadzone: 0.28,
    items: freezeArray(commands.map((command, index) => {
      const angle = start + index * step;
      return {
        ...command,
        index,
        angle,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    })),
  });
}

export function selectTacticFromRadial(layout, input = {}) {
  const x = finite(input.x);
  const y = finite(input.y);
  const strength = clamp(Math.hypot(x, y));
  if (!layout?.items?.length || strength < finite(layout.deadzone, 0.28)) return null;
  const direction = { x: x / strength, y: y / strength };
  let selected = null;
  let best = -Infinity;
  for (const item of layout.items) {
    const score = direction.x * Math.cos(item.angle) + direction.y * Math.sin(item.angle);
    if (score > best) {
      best = score;
      selected = item;
    }
  }
  return selected ? Object.freeze({ ...selected, inputStrength: strength }) : null;
}

export class TacticalRadialMenu {
  constructor({ confirmationMs = 1200 } = {}) {
    this.confirmationMs = clamp(finite(confirmationMs, 1200), 500, 2500);
    this.openedAt = null;
    this.layout = null;
    this.selection = null;
    this.confirmation = null;
  }

  open(context, now = 0) {
    this.openedAt = finite(now);
    this.layout = createTacticRadialLayout(context);
    this.selection = null;
    return this.getSnapshot(now);
  }

  point(input, now = 0) {
    if (!this.layout) return this.getSnapshot(now);
    this.selection = selectTacticFromRadial(this.layout, input);
    return this.getSnapshot(now);
  }

  confirm(now = 0) {
    if (!this.layout || !this.selection) return Object.freeze({ accepted: false, reason: "no_selection" });
    const time = finite(now);
    const selected = this.selection;
    const command = Object.freeze({
      type: "SET_TEAM_TACTIC",
      tacticId: selected.id,
      context: selected.context,
      durationMs: selected.durationMs,
      issuedAt: time,
    });
    this.confirmation = Object.freeze({
      tacticId: selected.id,
      label: selected.label,
      message: `${selected.label} called`,
      shownAt: time,
      expiresAt: time + this.confirmationMs,
    });
    this.layout = null;
    this.selection = null;
    this.openedAt = null;
    return Object.freeze({ accepted: true, command, confirmation: this.confirmation });
  }

  cancel(now = 0) {
    this.layout = null;
    this.selection = null;
    this.openedAt = null;
    return this.getSnapshot(now);
  }

  getSnapshot(now = 0) {
    const time = finite(now);
    const visibleConfirmation = this.confirmation && time < this.confirmation.expiresAt
      ? this.confirmation
      : null;
    return Object.freeze({
      open: Boolean(this.layout),
      openedAt: this.openedAt,
      layout: this.layout,
      selection: this.selection,
      confirmation: visibleConfirmation,
    });
  }
}

// ---------------------------------------------------------------------------
// Off-ball contribution and safe teammate switching

export const OFF_BALL_COMMANDS = freezeArray([
  { id: "call_pass", label: "Call for pass", minimumSpacing: 1.2 },
  { id: "set_screen", label: "Set screen", minimumSpacing: 0 },
  { id: "cut", label: "Cut to basket", minimumSpacing: 0.8 },
  { id: "relocate", label: "Relocate", minimumSpacing: 1.8 },
  { id: "call_alley_oop", label: "Call for alley-oop", minimumSpacing: 0.6 },
  { id: "seal", label: "Seal defender", minimumSpacing: 0 },
  { id: "create_space", label: "Create space", minimumSpacing: 2.2 },
]);

const OFF_BALL_BY_ID = new Map(OFF_BALL_COMMANDS.map((command) => [command.id, command]));

export const OFF_BALL_GRADE_EVENTS = Object.freeze({
  good_cut: 0.045,
  screen_assist: 0.055,
  open_relocation: 0.03,
  successful_seal: 0.04,
  created_space: 0.025,
  alley_oop_finish: 0.06,
  pass_received_open: 0.025,
  clogged_lane: -0.025,
  abandoned_screen: -0.018,
  spammed_call: -0.012,
});

export function resolveOffBallCommand({
  command,
  actor,
  ballHandler,
  defender,
  basket,
  now = 0,
} = {}) {
  const commandId = idOf(command);
  const definition = OFF_BALL_BY_ID.get(commandId);
  if (!definition) return Object.freeze({ accepted: false, reason: "unknown_command", commands: Object.freeze([]) });
  if (!actor?.id || actor.active === false) {
    return Object.freeze({ accepted: false, reason: "inactive_actor", commands: Object.freeze([]) });
  }
  if (!ballHandler?.id || actor.id === ballHandler.id || actor.teamId !== ballHandler.teamId) {
    return Object.freeze({ accepted: false, reason: "not_off_ball_teammate", commands: Object.freeze([]) });
  }
  const spacing = distance(actor.position, ballHandler.position);
  if (["call_pass", "call_alley_oop"].includes(commandId) && actor.denied === true) {
    return Object.freeze({ accepted: false, reason: "passing_lane_denied", commands: Object.freeze([]) });
  }
  const hoopDirection = normalize({
    x: finite(basket?.x) - finite(actor.position?.x),
    z: finite(basket?.z) - finite(actor.position?.z),
  });
  const target = commandId === "relocate" || commandId === "create_space"
    ? Object.freeze({
      x: finite(actor.position?.x) + (hoopDirection.z || 1) * 2.2,
      z: finite(actor.position?.z) - hoopDirection.x * 2.2,
    })
    : Object.freeze({
      x: finite(basket?.x),
      z: finite(basket?.z),
    });
  const gradePreview = spacing >= definition.minimumSpacing ? 0.01 : 0;
  return Object.freeze({
    accepted: true,
    reason: null,
    commandId,
    gradePreview,
    commands: freezeArray([{
      type: "OFF_BALL_COMMAND",
      commandId,
      playerId: actor.id,
      target,
      issuedAt: finite(now),
      defenderId: defender?.id ?? null,
    }]),
  });
}

export function calculateOffBallGradeImpact(event, options = {}) {
  const eventId = idOf(event?.type ?? event);
  const base = finite(OFF_BALL_GRADE_EVENTS[eventId], 0);
  const repetitions = Math.max(0, Math.floor(finite(options.repetitions, event?.repetitions)));
  const difficulty = clamp(finite(options.difficulty, event?.difficulty ?? 0.5));
  const positiveScale = base > 0 ? (0.85 + difficulty * 0.3) / (1 + repetitions * 0.18) : 1;
  return Object.freeze({
    event: eventId,
    delta: clamp(base * positiveScale, -0.08, 0.08),
    rewarded: base > 0,
    reason: base === 0 ? "ungraded_event" : eventId,
  });
}

export function selectSafeTeammate({
  currentPlayerId,
  players = [],
  teamId,
  ballOwnerId = null,
  direction = null,
  now = 0,
  lastSwitchAt = -Infinity,
  cooldownMs = 180,
  allowBallHandler = true,
} = {}) {
  const time = finite(now);
  if (time - finite(lastSwitchAt, -Infinity) < Math.max(0, finite(cooldownMs, 180))) {
    return Object.freeze({ accepted: false, reason: "switch_cooldown", playerId: currentPlayerId ?? null });
  }
  const current = players.find((player) => player.id === currentPlayerId);
  const resolvedTeam = teamId ?? current?.teamId;
  const candidates = players.filter((player) =>
    player.id !== currentPlayerId
      && player.teamId === resolvedTeam
      && player.active !== false
      && player.available !== false
      && !player.ejected
      && (allowBallHandler || player.id !== ballOwnerId));
  if (!candidates.length) {
    return Object.freeze({ accepted: false, reason: "no_safe_teammate", playerId: currentPlayerId ?? null });
  }
  const aim = normalize(direction);
  const origin = point(current?.position);
  const ranked = candidates.map((player, rosterIndex) => {
    const offset = {
      x: finite(player.position?.x) - origin.x,
      z: finite(player.position?.z) - origin.z,
    };
    const alongAim = magnitude(direction) > 0.1 ? dot(normalize(offset), aim) : 0;
    const possessionBonus = player.id === ballOwnerId ? 0.08 : 0;
    return { player, rosterIndex, score: alongAim + possessionBonus - distance(origin, player.position) * 0.002 };
  }).sort((a, b) => b.score - a.score || a.rosterIndex - b.rosterIndex || String(a.player.id).localeCompare(String(b.player.id)));
  const selected = ranked[0].player;
  return Object.freeze({
    accepted: true,
    reason: null,
    playerId: selected.id,
    previousPlayerId: currentPlayerId ?? null,
    switchedAt: time,
    command: Object.freeze({ type: "SWITCH_CONTROL", playerId: selected.id }),
  });
}

// ---------------------------------------------------------------------------
// Defense: useful stance actions, with escalating reach spam risk

export const DEFENSIVE_ACTIONS = freezeArray([
  { id: "hands_up", commitmentMs: 80, staminaCost: 0.004, contest: 0.58 },
  { id: "intense", commitmentMs: 90, staminaCost: 0.012, contest: 0.66 },
  { id: "ground_contest", commitmentMs: 110, staminaCost: 0.007, contest: 0.72 },
  { id: "vertical_contest", commitmentMs: 330, staminaCost: 0.025, contest: 0.9 },
  { id: "take_charge", commitmentMs: 520, staminaCost: 0.018, contest: 0.5 },
  { id: "box_out", commitmentMs: 180, staminaCost: 0.014, contest: 0.42 },
  { id: "deny_pass", commitmentMs: 100, staminaCost: 0.01, contest: 0.5 },
  { id: "shade_left", commitmentMs: 80, staminaCost: 0.006, contest: 0.48 },
  { id: "shade_right", commitmentMs: 80, staminaCost: 0.006, contest: 0.48 },
  { id: "double_team", commitmentMs: 160, staminaCost: 0.02, contest: 0.74 },
  { id: "controlled_slide", commitmentMs: 55, staminaCost: 0.007, contest: 0.56 },
  { id: "steal", commitmentMs: 390, staminaCost: 0.024, contest: 0.18 },
]);

const DEFENSE_BY_ID = new Map(DEFENSIVE_ACTIONS.map((action) => [action.id, action]));

export function resolveDefensiveAction({ action, defender = {}, matchup = {}, spamCount = 0, now = 0 } = {}) {
  const actionId = idOf(action);
  const definition = DEFENSE_BY_ID.get(actionId);
  if (!definition) return Object.freeze({ accepted: false, reason: "unknown_action" });
  if (defender.active === false || defender.grounded === false && actionId === "take_charge") {
    return Object.freeze({ accepted: false, reason: "invalid_defender_state" });
  }
  const stamina = rating(defender.stamina, 0.78);
  const discipline = rating(defender.discipline, 0.7);
  const defense = rating(defender.perimeterDefense ?? defender.defense, 0.7);
  const alignment = clamp((finite(matchup.alignment, 0.5) + 1) / 2);
  const range = 1 - clamp((Math.max(0, finite(matchup.distance, 1.1)) - 0.45) / 2.15);
  const repetitions = actionId === "steal" ? Math.max(0, Math.floor(finite(spamCount))) : 0;
  const spamPenalty = clamp(repetitions * 0.16, 0, 0.64);
  const effectiveness = clamp(
    definition.contest * 0.38 + defense * 0.25 + discipline * 0.14
      + stamina * 0.1 + alignment * 0.07 + range * 0.06 - spamPenalty * 0.36,
  );
  const foulRisk = actionId === "steal"
    ? clamp(0.06 + (1 - discipline) * 0.16 + (1 - alignment) * 0.12 + spamPenalty * 0.62, 0.02, 0.72)
    : clamp((1 - discipline) * 0.035 + (actionId === "take_charge" ? 0.035 : 0), 0, 0.1);
  const exposure = actionId === "steal" ? clamp(0.22 + spamPenalty, 0, 0.9) : clamp(0.08 - effectiveness * 0.04);
  return Object.freeze({
    accepted: true,
    actionId,
    performedAt: finite(now),
    effectiveness,
    foulRisk,
    exposure,
    spamPenalty,
    staminaCost: definition.staminaCost,
    commitmentMs: definition.commitmentMs,
    interruptible: definition.commitmentMs <= 180,
    command: Object.freeze({
      type: "DEFENSIVE_ACTION",
      actionId,
      effectiveness,
      commitmentMs: definition.commitmentMs,
    }),
  });
}

export class DefensiveControlSystem {
  constructor({ spamWindowMs = 1400 } = {}) {
    this.spamWindowMs = clamp(finite(spamWindowMs, 1400), 500, 3000);
    this.reachAttempts = new Map();
  }

  perform(input = {}) {
    const playerId = input.defender?.id ?? "anonymous";
    const now = finite(input.now);
    const actionId = idOf(input.action);
    const prior = (this.reachAttempts.get(playerId) || [])
      .filter((time) => now - time <= this.spamWindowMs && now >= time);
    const result = resolveDefensiveAction({ ...input, spamCount: prior.length });
    if (result.accepted && actionId === "steal") {
      prior.push(now);
      this.reachAttempts.set(playerId, prior);
    } else if (prior.length) {
      this.reachAttempts.set(playerId, prior);
    }
    return result;
  }

  reset(playerId) {
    if (playerId == null) this.reachAttempts.clear();
    else this.reachAttempts.delete(playerId);
  }
}

// ---------------------------------------------------------------------------
// Planted triple-threat and contextual post play

export const TRIPLE_THREAT_ACTIONS = freezeArray([
  { id: "jab_step", commitmentMs: 230 },
  { id: "pump_fake", commitmentMs: 300 },
  { id: "pass_fake", commitmentMs: 220 },
  { id: "pivot", commitmentMs: 180 },
  { id: "protect_ball", commitmentMs: 120 },
  { id: "explosive_first_step", commitmentMs: 420 },
  { id: "spin_launch", commitmentMs: 520 },
  { id: "step_through", commitmentMs: 460 },
]);

const TRIPLE_BY_ID = new Map(TRIPLE_THREAT_ACTIONS.map((action) => [action.id, action]));

export function validateTripleThreatContext({ action, player = {}, defender = null } = {}) {
  const actionId = idOf(action);
  if (!TRIPLE_BY_ID.has(actionId)) return Object.freeze({ valid: false, reason: "unknown_action", actionId });
  if (!player.hasBall || ![undefined, "held"].includes(player.ballState)) {
    return Object.freeze({ valid: false, reason: "ball_not_held", actionId });
  }
  if (player.hasDribbled === true) return Object.freeze({ valid: false, reason: "dribble_already_used", actionId });
  if (player.grounded === false || magnitude(player.velocity) > 0.24) {
    return Object.freeze({ valid: false, reason: "not_planted", actionId });
  }
  if (actionId === "step_through" && player.previousAction !== "pump_fake" && defender?.airborne !== true) {
    return Object.freeze({ valid: false, reason: "step_through_requires_committed_defender", actionId });
  }
  return Object.freeze({ valid: true, reason: null, actionId });
}

export function resolveTripleThreatAction({ action, player = {}, defender = null, direction = {}, now = 0 } = {}) {
  const validation = validateTripleThreatContext({ action, player, defender });
  if (!validation.valid) return Object.freeze({ executed: false, ...validation, commands: Object.freeze([]) });
  const definition = TRIPLE_BY_ID.get(validation.actionId);
  const pivotFoot = player.pivotFoot === "right" ? "right" : "left";
  const footwork = rating(player.footwork, 0.68);
  const balance = rating(player.balance, 0.7);
  const stamina = rating(player.stamina, 0.8);
  const defenderBalance = rating(defender?.balance, 0.7);
  const launchAction = ["explosive_first_step", "spin_launch"].includes(validation.actionId);
  const advantage = clamp(
    0.28 + footwork * 0.28 + balance * 0.16 + stamina * 0.1
      + clamp(magnitude(direction)) * 0.08 - defenderBalance * 0.14,
  );
  return Object.freeze({
    executed: true,
    valid: true,
    reason: null,
    actionId: validation.actionId,
    pivotFoot,
    keepsPivot: validation.actionId !== "explosive_first_step" && validation.actionId !== "spin_launch",
    startsDribble: launchAction,
    advantage,
    commitmentMs: definition.commitmentMs,
    interruptibleAfterMs: Math.min(180, definition.commitmentMs * 0.45),
    commands: freezeArray([{
      type: "TRIPLE_THREAT_ACTION",
      actionId: validation.actionId,
      pivotFoot,
      direction: normalize(direction),
      issuedAt: finite(now),
      startsDribble: launchAction,
    }]),
  });
}

export const POST_ACTIONS = freezeArray([
  { id: "post_up", range: [0.6, 5.5], base: 0.58 },
  { id: "backdown", range: [0.5, 4], base: 0.54 },
  { id: "drop_step", range: [0.4, 2.6], base: 0.57 },
  { id: "post_spin", range: [0.6, 4], base: 0.53 },
  { id: "shoulder_fake", range: [0.5, 4.5], base: 0.55 },
  { id: "hook_shot", range: [0.5, 4.4], base: 0.52 },
  { id: "post_fade", range: [1, 5.8], base: 0.48 },
  { id: "up_and_under", range: [0.4, 3.2], base: 0.53 },
  { id: "kick_out_pass", range: [0.4, 6], base: 0.72 },
  { id: "post_defense", range: [0, 6], base: 0.58 },
]);

const POST_BY_ID = new Map(POST_ACTIONS.map((action) => [action.id, action]));

export function validatePostContext({ action, offense = {}, defense = {}, basket = {}, context = {} } = {}) {
  const actionId = idOf(action);
  const definition = POST_BY_ID.get(actionId);
  if (!definition) return Object.freeze({ valid: false, reason: "unknown_action", actionId });
  if (offense.active === false || defense.active === false) {
    return Object.freeze({ valid: false, reason: "inactive_matchup", actionId });
  }
  if (actionId !== "post_defense" && !offense.hasBall) {
    return Object.freeze({ valid: false, reason: "ball_not_held", actionId });
  }
  const bodyDistance = distance(offense.position, defense.position);
  const maximumContact = actionId === "post_up" ? 2.1 : 1.65;
  if (bodyDistance > maximumContact) return Object.freeze({ valid: false, reason: "no_post_contact", actionId });
  if (actionId !== "post_up" && actionId !== "post_defense" && offense.postEngaged !== true && context.postEngaged !== true) {
    return Object.freeze({ valid: false, reason: "post_not_established", actionId });
  }
  if (offense.grounded === false && !["hook_shot", "post_fade"].includes(actionId)) {
    return Object.freeze({ valid: false, reason: "not_grounded", actionId });
  }
  const basketDistance = distance(offense.position, basket);
  if (basketDistance < definition.range[0] || basketDistance > definition.range[1]) {
    return Object.freeze({ valid: false, reason: "outside_action_range", actionId, basketDistance });
  }
  return Object.freeze({ valid: true, reason: null, actionId, bodyDistance, basketDistance });
}

export function resolvePostAction({
  action,
  offense = {},
  defense = {},
  basket = {},
  context = {},
  roll = 0.5,
} = {}) {
  const validation = validatePostContext({ action, offense, defense, basket, context });
  if (!validation.valid) return Object.freeze({ resolved: false, ...validation, commands: Object.freeze([]) });
  const definition = POST_BY_ID.get(validation.actionId);
  const strengthEdge = rating(offense.strength, 0.7) - rating(defense.strength, 0.7);
  const balanceEdge = rating(offense.balance, 0.7) - rating(defense.balance, 0.7);
  const heightEdge = clamp((finite(offense.height, 1.96) - finite(defense.height, 1.96)) / 0.3, -1, 1);
  const staminaEdge = rating(offense.stamina, 0.8) - rating(defense.stamina, 0.8);
  const dominantHand = idOf(offense.dominantHand || "right");
  const finishHand = idOf(context.finishHand || dominantHand);
  const handAdvantage = finishHand === dominantHand ? 1 : rating(offense.weakHand, 0.55);
  const angleAdvantage = clamp((finite(context.attackAngle, 0.55) + 1) / 2);
  const idealDistance = (definition.range[0] + definition.range[1]) / 2;
  const rangeHalf = Math.max(0.25, (definition.range[1] - definition.range[0]) / 2);
  const positionQuality = clamp(1 - Math.abs(validation.basketDistance - idealDistance) / rangeHalf);
  const defensePosition = clamp(finite(context.defenderPositionQuality, 0.6));
  const fakeBonus = context.defenderAirborne && ["up_and_under", "shoulder_fake"].includes(validation.actionId) ? 0.14 : 0;
  const sizeWeight = ["backdown", "drop_step", "hook_shot", "post_defense"].includes(validation.actionId) ? 1 : 0.65;
  const probability = clamp(
    definition.base * 0.36
      + (strengthEdge + 1) * 0.11 * sizeWeight
      + (balanceEdge + 1) * 0.09
      + (heightEdge + 1) * 0.075 * sizeWeight
      + (staminaEdge + 1) * 0.07
      + handAdvantage * 0.08
      + angleAdvantage * 0.075
      + positionQuality * 0.08
      - defensePosition * 0.1
      + fakeBonus,
    0.08,
    0.94,
  );
  const success = clamp(finite(roll, 0.5)) < probability;
  const staminaCost = clamp(0.018 + sizeWeight * 0.018 + (1 - rating(offense.stamina, 0.8)) * 0.012, 0.015, 0.06);
  const contributions = Object.freeze({
    strengthEdge,
    balanceEdge,
    heightEdge,
    staminaEdge,
    handAdvantage,
    angleAdvantage,
    positionQuality,
    defensePosition,
  });
  return Object.freeze({
    resolved: true,
    valid: true,
    actionId: validation.actionId,
    success,
    probability,
    staminaCost,
    contributions,
    commands: freezeArray([{
      type: "POST_ACTION",
      actionId: validation.actionId,
      success,
      probability,
      staminaCost,
    }]),
  });
}

// ---------------------------------------------------------------------------
// Low-latency, interruptible input buffering with telemetry

export const INPUT_ACTION_PROFILES = Object.freeze({
  shoot: Object.freeze({ priority: 75, maxAgeMs: 100, interrupts: ["movement", "dribble"] }),
  pass: Object.freeze({ priority: 80, maxAgeMs: 90, interrupts: ["movement", "dribble", "triple_threat"] }),
  defensive_movement: Object.freeze({ priority: 60, maxAgeMs: 65, interrupts: ["movement", "defense"] }),
  dribble: Object.freeze({ priority: 65, maxAgeMs: 95, interrupts: ["movement", "dribble"] }),
  player_switch: Object.freeze({ priority: 85, maxAgeMs: 90, interrupts: ["movement", "defense"] }),
  rebound: Object.freeze({ priority: 72, maxAgeMs: 100, interrupts: ["movement", "box_out"] }),
  pause: Object.freeze({ priority: 100, maxAgeMs: 250, interrupts: ["*"] }),
  movement: Object.freeze({ priority: 40, maxAgeMs: 55, interrupts: ["movement"] }),
  default: Object.freeze({ priority: 50, maxAgeMs: 90, interrupts: [] }),
});

const profileFor = (action, profile) => {
  const base = INPUT_ACTION_PROFILES[idOf(action)] || INPUT_ACTION_PROFILES.default;
  return Object.freeze({
    priority: finite(profile?.priority, base.priority),
    maxAgeMs: Math.max(1, finite(profile?.maxAgeMs, base.maxAgeMs)),
    interrupts: Object.freeze([...(profile?.interrupts || base.interrupts)]),
  });
};

export class BufferedInputQueue {
  constructor({ targetLatencyMs = 50, capacity = 24 } = {}) {
    this.targetLatencyMs = clamp(finite(targetLatencyMs, 50), 8, 100);
    this.capacity = Math.max(4, Math.floor(finite(capacity, 24)));
    this.sequence = 0;
    this.queue = [];
    this.latencies = [];
    this.droppedExpired = 0;
    this.droppedOverflow = 0;
    this.blockedByCommitment = 0;
  }

  enqueue(action, payload = {}, timing = {}) {
    const actionId = idOf(action);
    if (!actionId) return Object.freeze({ accepted: false, reason: "missing_action" });
    const inputAt = finite(typeof timing === "number" ? timing : timing.inputAt, 0);
    const receivedAt = Math.max(inputAt, finite(timing.receivedAt, inputAt));
    const profile = profileFor(actionId, timing.profile);
    const item = Object.freeze({
      id: ++this.sequence,
      action: actionId,
      payload: Object.freeze({ ...payload }),
      inputAt,
      receivedAt,
      captureLatencyMs: receivedAt - inputAt,
      profile,
    });
    if (["movement", "defensive_movement"].includes(actionId)) {
      this.queue = this.queue.filter((queued) => queued.action !== actionId);
    }
    this.queue.push(item);
    if (this.queue.length > this.capacity) {
      this.queue.sort((a, b) => a.profile.priority - b.profile.priority || a.inputAt - b.inputAt);
      this.queue.shift();
      this.droppedOverflow += 1;
    }
    return Object.freeze({ accepted: true, item, queued: this.queue.length });
  }

  canInterrupt(item, currentAction, now) {
    if (!currentAction) return true;
    const lockEndsAt = finite(currentAction.lockedUntil, -Infinity);
    if (finite(now) >= lockEndsAt || currentAction.interruptible === true) return true;
    const currentId = idOf(currentAction.category ?? currentAction.action);
    return item.profile.interrupts.includes("*") || item.profile.interrupts.includes(currentId);
  }

  consume({ now = 0, currentAction = null, canExecute = () => true } = {}) {
    const time = finite(now);
    this.queue = this.queue.filter((item) => {
      const fresh = time - item.inputAt <= item.profile.maxAgeMs;
      if (!fresh) this.droppedExpired += 1;
      return fresh;
    });
    const ordered = [...this.queue].sort((a, b) =>
      b.profile.priority - a.profile.priority || a.inputAt - b.inputAt || a.id - b.id);
    for (const item of ordered) {
      if (!this.canInterrupt(item, currentAction, time)) {
        this.blockedByCommitment += 1;
        continue;
      }
      if (!canExecute(item.action, item.payload)) continue;
      this.queue = this.queue.filter((candidate) => candidate.id !== item.id);
      const latencyMs = Math.max(0, time - item.inputAt);
      this.latencies.push(latencyMs);
      if (this.latencies.length > 256) this.latencies.shift();
      return Object.freeze({
        consumed: true,
        action: item.action,
        payload: item.payload,
        inputId: item.id,
        latencyMs,
        captureLatencyMs: item.captureLatencyMs,
        withinTarget: latencyMs <= this.targetLatencyMs,
        interrupted: Boolean(currentAction),
      });
    }
    return Object.freeze({ consumed: false, reason: this.queue.length ? "not_executable" : "empty" });
  }

  clear() {
    this.queue = [];
  }

  getMetrics() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const percentile = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
    const total = this.latencies.reduce((sum, value) => sum + value, 0);
    return Object.freeze({
      targetLatencyMs: this.targetLatencyMs,
      samples: sorted.length,
      averageLatencyMs: sorted.length ? total / sorted.length : 0,
      p95LatencyMs: percentile,
      maxLatencyMs: sorted.at(-1) ?? 0,
      targetMisses: sorted.filter((value) => value > this.targetLatencyMs).length,
      queued: this.queue.length,
      droppedExpired: this.droppedExpired,
      droppedOverflow: this.droppedOverflow,
      blockedByCommitment: this.blockedByCommitment,
    });
  }
}

export const createInputBuffer = (options) => new BufferedInputQueue(options);

// ---------------------------------------------------------------------------
// Controller family prompts, lifecycle, and local assignments

export const CONTROLLER_FAMILIES = Object.freeze({
  KEYBOARD: "keyboard",
  XBOX: "xbox",
  PLAYSTATION: "playstation",
  GENERIC: "generic",
});

export function detectControllerFamily(gamepad = {}) {
  const identity = `${gamepad.id || gamepad}`.toLowerCase();
  if (/dualsense|dualshock|playstation|sony|^wireless controller/.test(identity)) return CONTROLLER_FAMILIES.PLAYSTATION;
  if (/xbox|xinput|microsoft|x-box|360 controller/.test(identity)) return CONTROLLER_FAMILIES.XBOX;
  return CONTROLLER_FAMILIES.GENERIC;
}

export const CONTROLLER_PROMPTS = Object.freeze({
  xbox: Object.freeze({ confirm: "A", cancel: "B", shoot: "X", pass: "A", switch: "RB", tactics: "D-pad" }),
  playstation: Object.freeze({ confirm: "Cross", cancel: "Circle", shoot: "Square", pass: "Cross", switch: "R1", tactics: "D-pad" }),
  generic: Object.freeze({ confirm: "Button 0", cancel: "Button 1", shoot: "Button 2", pass: "Button 0", switch: "Button 5", tactics: "D-pad" }),
});

export class InputDeviceManager {
  constructor({ keyboardBindings = {} } = {}) {
    this.keyboardBindings = { ...keyboardBindings };
    this.controllers = new Map();
    this.assignments = new Map();
    this.activeDevice = "keyboard";
    this.activeFamily = CONTROLLER_FAMILIES.KEYBOARD;
    this.events = [];
  }

  setKeyboardBindings(bindings = {}) {
    this.keyboardBindings = { ...this.keyboardBindings, ...bindings };
  }

  connect(gamepad = {}, now = 0) {
    const index = Math.max(0, Math.floor(finite(gamepad.index)));
    const deviceId = `gamepad:${index}`;
    const previous = this.controllers.get(index);
    const controller = Object.freeze({
      index,
      deviceId,
      id: String(gamepad.id || previous?.id || "Generic Controller"),
      family: detectControllerFamily(gamepad.id || previous?.id),
      mapping: gamepad.mapping || previous?.mapping || "standard",
      connected: true,
      connectedAt: finite(now),
    });
    this.controllers.set(index, controller);
    this.events.push(Object.freeze({
      type: previous && !previous.connected ? "controller_reconnected" : "controller_connected",
      deviceId,
      family: controller.family,
      playerId: this.assignments.get(deviceId) ?? null,
      at: finite(now),
    }));
    return controller;
  }

  disconnect(index, now = 0) {
    const resolvedIndex = Math.max(0, Math.floor(finite(index)));
    const prior = this.controllers.get(resolvedIndex);
    if (!prior?.connected) return Object.freeze({ disconnected: false, reason: "not_connected" });
    const controller = Object.freeze({ ...prior, connected: false, disconnectedAt: finite(now) });
    this.controllers.set(resolvedIndex, controller);
    const warning = Object.freeze({
      type: "controller_disconnected",
      deviceId: prior.deviceId,
      playerId: this.assignments.get(prior.deviceId) ?? null,
      message: `${prior.family} controller disconnected`,
      at: finite(now),
    });
    this.events.push(warning);
    if (this.activeDevice === prior.deviceId) {
      this.activeDevice = "keyboard";
      this.activeFamily = CONTROLLER_FAMILIES.KEYBOARD;
    }
    return Object.freeze({ disconnected: true, warning });
  }

  recordKeyboardActivity(code, now = 0) {
    this.activeDevice = "keyboard";
    this.activeFamily = CONTROLLER_FAMILIES.KEYBOARD;
    return Object.freeze({ deviceId: "keyboard", family: this.activeFamily, code, at: finite(now) });
  }

  recordControllerActivity(index, now = 0) {
    const controller = this.controllers.get(Math.max(0, Math.floor(finite(index))));
    if (!controller?.connected) return Object.freeze({ accepted: false, reason: "controller_disconnected" });
    this.activeDevice = controller.deviceId;
    this.activeFamily = controller.family;
    return Object.freeze({ accepted: true, deviceId: controller.deviceId, family: controller.family, at: finite(now) });
  }

  assign(deviceId, playerId) {
    const normalizedDevice = String(deviceId || "");
    if (normalizedDevice !== "keyboard") {
      const index = Number(normalizedDevice.split(":")[1]);
      if (!this.controllers.get(index)?.connected) return Object.freeze({ assigned: false, reason: "device_unavailable" });
    }
    if ([...this.assignments.entries()].some(([device, player]) => device !== normalizedDevice && player === playerId)) {
      return Object.freeze({ assigned: false, reason: "player_already_assigned" });
    }
    this.assignments.set(normalizedDevice, playerId);
    return Object.freeze({ assigned: true, deviceId: normalizedDevice, playerId });
  }

  unassign(deviceId) {
    return this.assignments.delete(String(deviceId || ""));
  }

  getPrompt(action) {
    const actionId = idOf(action);
    if (this.activeFamily === CONTROLLER_FAMILIES.KEYBOARD) {
      const binding = this.keyboardBindings[actionId];
      const label = Array.isArray(binding) ? binding[0] : binding;
      return Object.freeze({ family: "keyboard", action: actionId, label: label || actionId.toUpperCase() });
    }
    const labels = CONTROLLER_PROMPTS[this.activeFamily] || CONTROLLER_PROMPTS.generic;
    return Object.freeze({ family: this.activeFamily, action: actionId, label: labels[actionId] || `Button (${actionId})` });
  }

  drainEvents() {
    const events = Object.freeze([...this.events]);
    this.events = [];
    return events;
  }

  getSnapshot() {
    return Object.freeze({
      activeDevice: this.activeDevice,
      activeFamily: this.activeFamily,
      promptMode: this.activeFamily,
      controllers: freezeArray([...this.controllers.values()]),
      assignments: freezeArray([...this.assignments].map(([deviceId, playerId]) => ({ deviceId, playerId }))),
    });
  }
}

// ---------------------------------------------------------------------------
// Adjustable haptic patterns

const freezePattern = (segments, cooldownMs = 0) => Object.freeze({
  cooldownMs,
  segments: freezeArray(segments),
});

export const VIBRATION_PATTERNS = Object.freeze({
  dribble: freezePattern([{ startDelay: 0, duration: 28, weak: 0.18, strong: 0.04 }], 70),
  collision: freezePattern([{ startDelay: 0, duration: 110, weak: 0.58, strong: 0.82 }], 100),
  hard_rim: freezePattern([
    { startDelay: 0, duration: 62, weak: 0.3, strong: 0.72 },
    { startDelay: 78, duration: 45, weak: 0.22, strong: 0.48 },
  ], 140),
  perfect_release: freezePattern([{ startDelay: 0, duration: 52, weak: 0.42, strong: 0.16 }], 120),
  low_stamina: freezePattern([
    { startDelay: 0, duration: 45, weak: 0.28, strong: 0.12 },
    { startDelay: 92, duration: 75, weak: 0.16, strong: 0.36 },
  ], 650),
  block: freezePattern([{ startDelay: 0, duration: 135, weak: 0.48, strong: 0.9 }], 160),
  game_point: freezePattern([{ startDelay: 0, duration: 38, weak: 0.16, strong: 0.08 }], 1200),
});

export function compileVibrationPattern(pattern, { strength = 1, enabled = true } = {}) {
  const definition = typeof pattern === "string" ? VIBRATION_PATTERNS[idOf(pattern)] : pattern;
  if (!enabled || !definition) return Object.freeze([]);
  const scale = clamp(finite(strength, 1));
  return freezeArray(definition.segments.map((segment) => ({
    duration: Math.max(0, finite(segment.duration)),
    startDelay: Math.max(0, finite(segment.startDelay)),
    weakMagnitude: clamp(finite(segment.weak) * scale),
    strongMagnitude: clamp(finite(segment.strong) * scale),
  })));
}

export class VibrationManager {
  constructor({ strength = 0.7, enabled = true } = {}) {
    this.strength = clamp(finite(strength, 0.7));
    this.enabled = Boolean(enabled) && this.strength > 0;
    this.lastPlayed = new Map();
  }

  configure({ strength = this.strength, enabled = this.enabled } = {}) {
    this.strength = clamp(finite(strength, this.strength));
    this.enabled = Boolean(enabled) && this.strength > 0;
    return Object.freeze({ strength: this.strength, enabled: this.enabled });
  }

  trigger(pattern, actuator, { now = 0, strength = 1 } = {}) {
    const patternId = idOf(pattern);
    const definition = VIBRATION_PATTERNS[patternId];
    if (!this.enabled || !definition) return Object.freeze({ played: false, reason: "disabled_or_unknown", effects: Object.freeze([]) });
    if (!actuator?.playEffect) return Object.freeze({ played: false, reason: "unsupported", effects: Object.freeze([]) });
    const time = finite(now);
    const last = this.lastPlayed.get(patternId) ?? -Infinity;
    if (time - last < definition.cooldownMs) {
      return Object.freeze({ played: false, reason: "cooldown", effects: Object.freeze([]) });
    }
    const effects = compileVibrationPattern(definition, {
      enabled: this.enabled,
      strength: this.strength * clamp(finite(strength, 1)),
    });
    for (const effect of effects) {
      try {
        const promise = actuator.playEffect("dual-rumble", effect);
        if (promise?.catch) promise.catch(() => {});
      } catch {
        return Object.freeze({ played: false, reason: "actuator_error", effects: Object.freeze([]) });
      }
    }
    this.lastPlayed.set(patternId, time);
    const totalDuration = effects.reduce((end, effect) => Math.max(end, effect.startDelay + effect.duration), 0);
    return Object.freeze({ played: true, patternId, effects, totalDuration });
  }
}
