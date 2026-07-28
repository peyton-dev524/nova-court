/**
 * Nova Court basketball AI.
 *
 * The director is deliberately renderer/physics agnostic. It consumes a plain
 * snapshot and returns high-level intents for the game engine to execute.
 *
 * Required snapshot fields:
 *   players: [{ id, teamId, position:{x,z}, velocity?, hasBall?, role?,
 *               isHuman?, aiEnabled?, stamina?, isShooting? }]
 *   ball: { position:{x,z}, velocity?, holderId?, isLoose?, airborne? }
 *   offenseTeamId: string|number|null
 *
 * Useful optional fields:
 *   attackBaskets: { [teamId]: {x,z} } // hoop that team attacks
 *   court: { halfWidth, halfLength, threePointRadius }
 *   phase: "live" | "check" | "dead" | "finished"
 *   shotClock, gameClock, possessionId
 *
 * Each intent has:
 *   { playerId, state, move:{target,speed}, face, action|null, debug }
 * Actions are requests, not authoritative results. The game engine remains
 * responsible for collisions, animation, stamina, and rules adjudication.
 */

export const AI_STATES = Object.freeze({
  IDLE: "idle",
  CHECK_WAIT: "check_wait",
  TRANSITION_OFFENSE: "transition_offense",
  TRANSITION_DEFENSE: "transition_defense",
  BALL_HANDLER: "ball_handler",
  DRIVE: "drive",
  CREATE_SHOT: "create_shot",
  OFF_BALL_SPACE: "off_ball_space",
  CUT: "cut",
  SCREEN: "screen",
  ON_BALL_DEFENSE: "on_ball_defense",
  DENY: "deny",
  HELP: "help",
  CONTEST: "contest",
  REBOUND: "rebound",
  LOOSE_BALL: "loose_ball",
});

export const AI_ROLES = Object.freeze({
  HANDLER: "handler",
  WING: "wing",
  BIG: "big",
  TWO_WAY: "two_way",
});

export const DIFFICULTY_PRESETS = Object.freeze({
  rookie: Object.freeze({
    reactionSeconds: 0.3,
    decisionSeconds: 0.34,
    moveSpeed: 0.84,
    defensiveCushion: 2.25,
    helpDistance: 3.4,
    contestRange: 1.75,
    contestUrgency: 0.68,
    stealRate: 0.07,
    blockRate: 0.18,
    shotConfidence: 0.7,
    shotDiscipline: 0.58,
    passingVision: 0.66,
    driveBias: 0.44,
    cutFrequency: 0.12,
    reboundAggression: 0.7,
    errorRate: 0.16,
  }),
  pro: Object.freeze({
    reactionSeconds: 0.16,
    decisionSeconds: 0.22,
    moveSpeed: 0.95,
    defensiveCushion: 1.65,
    helpDistance: 4.25,
    contestRange: 2.05,
    contestUrgency: 0.86,
    stealRate: 0.11,
    blockRate: 0.3,
    shotConfidence: 0.79,
    shotDiscipline: 0.76,
    passingVision: 0.82,
    driveBias: 0.52,
    cutFrequency: 0.18,
    reboundAggression: 0.86,
    errorRate: 0.08,
  }),
  allStar: Object.freeze({
    reactionSeconds: 0.08,
    decisionSeconds: 0.14,
    moveSpeed: 1,
    defensiveCushion: 1.25,
    helpDistance: 5,
    contestRange: 2.35,
    contestUrgency: 0.96,
    stealRate: 0.15,
    blockRate: 0.42,
    shotConfidence: 0.86,
    shotDiscipline: 0.9,
    passingVision: 0.94,
    driveBias: 0.58,
    cutFrequency: 0.24,
    reboundAggression: 0.97,
    errorRate: 0.035,
  }),
});

const DEFAULT_COURT = Object.freeze({
  halfWidth: 7.5,
  halfLength: 14,
  threePointRadius: 6.75,
});

const EPSILON = 0.0001;

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function positionOf(value) {
  const p = value?.position || value || {};
  return { x: Number(p.x) || 0, z: Number(p.z) || 0 };
}

function add(a, b) {
  return { x: a.x + b.x, z: a.z + b.z };
}

function subtract(a, b) {
  return { x: a.x - b.x, z: a.z - b.z };
}

function multiply(a, scalar) {
  return { x: a.x * scalar, z: a.z * scalar };
}

function length(vector) {
  return Math.hypot(vector.x, vector.z);
}

function distance(a, b) {
  return length(subtract(positionOf(a), positionOf(b)));
}

function normalized(vector) {
  const size = length(vector);
  return size < EPSILON ? { x: 0, z: 0 } : multiply(vector, 1 / size);
}

function lerp(a, b, amount) {
  const t = clamp(amount);
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function clampToCourt(point, court, margin = 0.65) {
  return {
    x: clamp(point.x, -court.halfWidth + margin, court.halfWidth - margin),
    z: clamp(point.z, -court.halfLength + margin, court.halfLength - margin),
  };
}

function closestTo(point, players) {
  let result = null;
  let bestDistance = Infinity;
  for (const player of players) {
    const d = distance(point, player);
    if (d < bestDistance) {
      bestDistance = d;
      result = player;
    }
  }
  return { player: result, distance: bestDistance };
}

function roleFor(player, index = 0) {
  if (Object.values(AI_ROLES).includes(player.role)) return player.role;
  if (player.height && player.height > 1.98) return AI_ROLES.BIG;
  return index === 0 ? AI_ROLES.HANDLER : index === 2 ? AI_ROLES.BIG : AI_ROLES.WING;
}

function attackBasketFor(teamId, snapshot, court) {
  if (typeof snapshot.getAttackBasket === "function") {
    return positionOf(snapshot.getAttackBasket(teamId));
  }
  const explicit = snapshot.attackBaskets?.[teamId];
  if (explicit) return positionOf(explicit);
  const direction = snapshot.attackDirectionByTeam?.[teamId] ?? (String(teamId) === "0" ? 1 : -1);
  return { x: 0, z: direction >= 0 ? court.halfLength - 0.9 : -court.halfLength + 0.9 };
}

function createSeededRandom(seed = 0x4e4f5641) {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mergeTuning(difficulty, overrides = {}) {
  const base = typeof difficulty === "object"
    ? { ...DIFFICULTY_PRESETS.pro, ...difficulty }
    : { ...(DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.pro) };
  return { ...base, ...overrides };
}

/**
 * Manages a complete AI team (or every non-human player when teamIds is null).
 */
export class BasketballAIDirector {
  constructor({
    difficulty = "pro",
    teamIds = null,
    seed = 0x4e4f5641,
    tuning = {},
    debug = false,
  } = {}) {
    this.difficultyName = typeof difficulty === "string" ? difficulty : "custom";
    this.tuning = mergeTuning(difficulty, tuning);
    this.teamIds = teamIds == null ? null : new Set([].concat(teamIds));
    this.debug = debug;
    this.random = createSeededRandom(seed);
    this.memory = new Map();
    this.elapsed = 0;
    this.lastPossessionId = null;
  }

  setDifficulty(difficulty, overrides = {}) {
    this.difficultyName = typeof difficulty === "string" ? difficulty : "custom";
    this.tuning = mergeTuning(difficulty, overrides);
  }

  reset() {
    this.memory.clear();
    this.elapsed = 0;
    this.lastPossessionId = null;
  }

  getDebugState() {
    return [...this.memory.entries()].map(([playerId, memory]) => ({
      playerId,
      state: memory.state,
      matchupId: memory.matchupId,
      stateSeconds: memory.stateSeconds,
      lastDecision: memory.lastDecision,
    }));
  }

  /**
   * @returns {Array<object>} one high-level intent per AI-controlled player.
   */
  update(deltaSeconds, snapshot) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.1);
    this.elapsed += dt;
    const court = { ...DEFAULT_COURT, ...(snapshot.court || {}) };
    const players = Array.isArray(snapshot.players) ? snapshot.players : [];
    const phase = snapshot.phase || "live";
    const holder = players.find((player) => player.id === snapshot.ball?.holderId)
      || players.find((player) => player.hasBall)
      || null;
    const offenseTeamId = snapshot.offenseTeamId ?? holder?.teamId ?? null;
    const possessionChanged = snapshot.possessionId != null
      && snapshot.possessionId !== this.lastPossessionId;
    if (snapshot.possessionId != null) this.lastPossessionId = snapshot.possessionId;

    const teamGroups = new Map();
    for (const player of players) {
      if (!teamGroups.has(player.teamId)) teamGroups.set(player.teamId, []);
      teamGroups.get(player.teamId).push(player);
    }

    this.#assignDefensiveMatchups(players, offenseTeamId);
    const intents = [];
    for (const player of players) {
      if (!this.#isControlled(player)) continue;
      const memory = this.#memoryFor(player);
      memory.stateSeconds += dt;
      memory.decisionCooldown -= dt;
      memory.actionCooldown -= dt;
      memory.stealCooldown -= dt;
      if (possessionChanged) {
        memory.decisionCooldown = Math.min(memory.decisionCooldown, this.tuning.reactionSeconds);
        memory.cutCommitment = 0;
        memory.driveCommitment = 0;
        memory.probeCount = 0;
        memory.possessionSeconds = 0;
      }
      if (player.id === holder?.id) memory.possessionSeconds += dt;
      else memory.possessionSeconds = 0;

      let intent;
      if (phase !== "live") {
        intent = this.#deadBallIntent(player, snapshot, court, memory);
      } else if (snapshot.ball?.airborne && !snapshot.ball?.isShotResolved) {
        intent = this.#reboundIntent(player, snapshot, players, court, memory);
      } else if (snapshot.ball?.isLoose || (!holder && snapshot.ball)) {
        intent = this.#looseBallIntent(player, snapshot, players, court, memory);
      } else if (player.teamId === offenseTeamId) {
        intent = player.id === holder?.id
          ? this.#ballHandlerIntent(player, snapshot, players, court, memory)
          : this.#offBallIntent(player, snapshot, players, holder, court, memory, teamGroups);
      } else {
        intent = this.#defensiveIntent(player, snapshot, players, holder, court, memory);
      }
      intents.push(intent);
    }
    return intents;
  }

  #isControlled(player) {
    if (player.aiEnabled === false || player.isHuman === true) return false;
    return this.teamIds == null || this.teamIds.has(player.teamId);
  }

  #memoryFor(player) {
    let memory = this.memory.get(player.id);
    if (!memory) {
      memory = {
        state: AI_STATES.IDLE,
        previousState: null,
        stateSeconds: 0,
        decisionCooldown: this.random() * this.tuning.reactionSeconds,
        actionCooldown: 0,
        stealCooldown: 0,
        matchupId: player.matchupId ?? null,
        cutCommitment: 0,
        driveCommitment: 0,
        probeCount: 0,
        possessionSeconds: 0,
        sidePreference: this.random() < 0.5 ? -1 : 1,
        lastDecision: "spawn",
      };
      this.memory.set(player.id, memory);
    }
    return memory;
  }

  #setState(memory, state, decision = state) {
    if (memory.state !== state) {
      memory.previousState = memory.state;
      memory.state = state;
      memory.stateSeconds = 0;
    }
    memory.lastDecision = decision;
  }

  #intent(player, memory, target, speed, face, action = null, extraDebug = {}) {
    const intent = {
      playerId: player.id,
      state: memory.state,
      move: {
        target: positionOf(target),
        speed: clamp(speed),
      },
      face: positionOf(face || target),
      action,
    };
    if (this.debug) {
      intent.debug = {
        decision: memory.lastDecision,
        matchupId: memory.matchupId,
        stateSeconds: Number(memory.stateSeconds.toFixed(2)),
        ...extraDebug,
      };
    }
    return intent;
  }

  #deadBallIntent(player, snapshot, court, memory) {
    const basket = attackBasketFor(player.teamId, snapshot, court);
    const checkSpot = snapshot.checkSpot || { x: 0, z: basket.z * -0.32 };
    const isOffense = player.teamId === snapshot.offenseTeamId;
    const offset = isOffense ? memory.sidePreference * 1.6 : memory.sidePreference * 1.25;
    const target = player.hasBall
      ? checkSpot
      : { x: offset, z: checkSpot.z + (isOffense ? -1.8 : 1.15) * Math.sign(basket.z || 1) };
    this.#setState(memory, AI_STATES.CHECK_WAIT, "take check position");
    const action = player.hasBall && distance(player, checkSpot) < 0.7
      ? { type: "checkReady" }
      : null;
    return this.#intent(player, memory, clampToCourt(target, court), 0.58, checkSpot, action);
  }

  #looseBallIntent(player, snapshot, players, court, memory) {
    const ballPosition = positionOf(snapshot.ball);
    const nearest = closestTo(ballPosition, players).player;
    const shouldPursue = nearest?.id === player.id
      || distance(player, ballPosition) < 2.25
      || roleFor(player) === AI_ROLES.HANDLER;
    if (shouldPursue) {
      this.#setState(memory, AI_STATES.LOOSE_BALL, "pursue loose ball");
      const action = distance(player, ballPosition) < 0.85 ? { type: "secureBall" } : null;
      return this.#intent(player, memory, ballPosition, 1, ballPosition, action);
    }
    const basket = attackBasketFor(player.teamId, snapshot, court);
    const target = lerp(ballPosition, basket, player.teamId === snapshot.offenseTeamId ? 0.22 : 0.48);
    this.#setState(memory, AI_STATES.TRANSITION_DEFENSE, "balance behind loose ball");
    return this.#intent(player, memory, clampToCourt(target, court), 0.82, ballPosition);
  }

  #reboundIntent(player, snapshot, players, court, memory) {
    const ballPosition = positionOf(snapshot.ball);
    const velocity = positionOf(snapshot.ball?.velocity);
    const landing = clampToCourt(add(ballPosition, multiply(velocity, 0.38)), court);
    const basket = attackBasketFor(
      snapshot.offenseTeamId,
      snapshot,
      court,
    );
    const teammates = players.filter((candidate) => candidate.teamId === player.teamId);
    const pursuer = closestTo(landing, teammates).player;
    const roleBonus = roleFor(player) === AI_ROLES.BIG ? 1.25 : 0;
    const shouldCrash = pursuer?.id === player.id
      || distance(player, landing) - roleBonus < 2.8 * this.tuning.reboundAggression;

    if (shouldCrash) {
      this.#setState(memory, AI_STATES.REBOUND, "track rebound");
      const action = distance(player, landing) < 1.35
        ? { type: "rebound", aggression: this.tuning.reboundAggression }
        : null;
      return this.#intent(player, memory, landing, this.tuning.moveSpeed, ballPosition, action);
    }

    const ownAttack = attackBasketFor(player.teamId, snapshot, court);
    const target = player.teamId === snapshot.offenseTeamId
      ? { x: memory.sidePreference * court.halfWidth * 0.55, z: basket.z * -0.12 }
      : lerp(ballPosition, ownAttack, 0.54);
    this.#setState(
      memory,
      player.teamId === snapshot.offenseTeamId
        ? AI_STATES.TRANSITION_DEFENSE
        : AI_STATES.TRANSITION_OFFENSE,
      "rebound safety",
    );
    return this.#intent(player, memory, clampToCourt(target, court), 0.84, ballPosition);
  }

  #ballHandlerIntent(player, snapshot, players, court, memory) {
    const basket = attackBasketFor(player.teamId, snapshot, court);
    const defenders = players.filter((candidate) => candidate.teamId !== player.teamId);
    const teammates = players.filter(
      (candidate) => candidate.teamId === player.teamId && candidate.id !== player.id,
    );
    const nearestDefender = closestTo(player, defenders);
    const hoopDistance = distance(player, basket);
    const shotClock = snapshot.shotClock ?? 24;
    const laneScore = this.#laneScore(player, basket, defenders);
    const shotQuality = this.#shotQuality(player, basket, nearestDefender.distance, snapshot);
    const clockUrgency = clamp((7 - shotClock) / 7);
    const pressure = clamp((2.35 - nearestDefender.distance) / 2.35);
    const separationBonus = memory.probeCount > 0 && nearestDefender.distance > 1.65 ? 0.08 : 0;
    const shotThreshold = this.tuning.shotConfidence - clockUrgency * 0.2 - separationBonus;
    const forcedShot = shotClock < 2.8;
    const openShot = shotQuality >= shotThreshold && nearestDefender.distance > 1.2;
    const atRim = hoopDistance < 2.25;
    const pullUpWindow = memory.possessionSeconds > 1.1
      && hoopDistance < court.threePointRadius + 0.7
      && nearestDefender.distance > 1.55
      && shotQuality > shotThreshold - 0.04;

    if (memory.decisionCooldown <= 0) {
      memory.decisionCooldown = this.tuning.decisionSeconds
        + this.random() * this.tuning.reactionSeconds;

      const pass = this.#bestPass(player, teammates, defenders, basket, snapshot);
      const passThreshold = 0.43 + (1 - this.tuning.passingVision) * 0.2;
      if (pass && memory.actionCooldown <= 0
        && pass.score > passThreshold
        && (pressure > 0.48 || pass.score > shotQuality + 0.08 || laneScore < 0.28)) {
        memory.actionCooldown = 0.48;
        memory.driveCommitment = 0;
        this.#setState(memory, AI_STATES.BALL_HANDLER, "read help and pass to " + pass.player.id);
        return this.#intent(player, memory, player, 0.18, pass.player, {
          type: "pass",
          targetPlayerId: pass.player.id,
          leadTarget: pass.leadTarget,
          passType: pass.type,
          score: pass.score,
        }, { passScore: pass.score, pressure, laneScore });
      }

      if ((forcedShot || atRim || openShot || pullUpWindow) && memory.actionCooldown <= 0) {
        memory.actionCooldown = atRim ? 0.72 : 1.05;
        memory.driveCommitment = 0;
        const shotType = atRim
          ? (player.canDunk !== false && (player.stamina ?? 1) > 0.35 ? "dunk" : "layup")
          : hoopDistance > court.threePointRadius ? "jumpShot3" : "jumpShot2";
        const decisionQuality = clamp(
          shotQuality + (forcedShot ? -0.08 : 0) + (openShot ? 0.04 : 0),
          0.48,
          0.96,
        );
        this.#setState(
          memory,
          atRim ? AI_STATES.DRIVE : AI_STATES.CREATE_SHOT,
          forcedShot ? "beat shot clock" : atRim ? "finish at rim" : "rise into open jumper",
        );
        return this.#intent(player, memory, player, 0, basket, {
          type: "shoot",
          shotType,
          target: basket,
          desiredRelease: 0.72,
          quality: decisionQuality,
        }, {
          shotQuality: decisionQuality,
          nearestDefender: nearestDefender.distance,
          clockUrgency,
        });
      }

      if (pressure > 0.58 && memory.actionCooldown <= 0) {
        memory.actionCooldown = 0.5;
        memory.probeCount += 1;
        memory.sidePreference *= -1;
        const separationMoves = ["snatchBack", "doubleCross", "spin", "behindBack", "shamgod"];
        const move = laneScore > 0.64 ? "shamgod" : separationMoves[memory.probeCount % separationMoves.length];
        const away = nearestDefender.player
          ? normalized(subtract(positionOf(player), positionOf(nearestDefender.player)))
          : { x: memory.sidePreference, z: 0 };
        const target = clampToCourt(add(positionOf(player), multiply(away, 1.4)), court);
        this.#setState(memory, AI_STATES.CREATE_SHOT, "create separation with handle");
        return this.#intent(player, memory, target, 0.82, basket, {
          type: "dribbleMove",
          move,
        }, { pressure, laneScore, probeCount: memory.probeCount });
      }
    }

    const driveChance = this.tuning.driveBias * laneScore
      + (hoopDistance < court.threePointRadius ? 0.18 : 0)
      + clockUrgency * 0.18;
    if (driveChance > 0.4 || memory.driveCommitment > 0) {
      memory.driveCommitment = Math.max(memory.driveCommitment - 0.015, 0.01);
      if (memory.driveCommitment <= 0.01) memory.driveCommitment = 1;
      const defender = nearestDefender.player;
      const sideStep = defender
        ? normalized({ x: positionOf(player).z - positionOf(defender).z, z: positionOf(defender).x - positionOf(player).x })
        : { x: memory.sidePreference, z: 0 };
      const laneTarget = lerp(positionOf(player), basket, hoopDistance < 3.5 ? 0.88 : 0.68);
      const driveTarget = add(laneTarget, multiply(sideStep, memory.sidePreference * (1 - laneScore) * 0.75));
      this.#setState(memory, AI_STATES.DRIVE, "commit to open driving lane");
      return this.#intent(
        player,
        memory,
        clampToCourt(driveTarget, court, 0.25),
        this.tuning.moveSpeed,
        basket,
        nearestDefender.distance < 1.75 && memory.actionCooldown <= 0
          ? { type: "dribbleMove", move: laneScore > 0.62 ? "shamgod" : laneScore > 0.42 ? "hesi" : "doubleCross" }
          : null,
        { laneScore, driveChance },
      );
    }

    memory.probeCount += memory.stateSeconds > 0.8 ? 1 : 0;
    const lateral = normalized({ x: -basket.z, z: basket.x });
    const target = clampToCourt(
      add(positionOf(player), multiply(lateral, memory.sidePreference * 1.45)),
      court,
    );
    this.#setState(memory, AI_STATES.CREATE_SHOT, "size up and shift defense");
    return this.#intent(player, memory, target, 0.74, basket, {
      type: "dribbleMove",
      move: ["inOut", "crossover", "doubleCross", "snatchBack"][memory.probeCount % 4],
    }, { shotQuality, laneScore, pressure });
  }

  #offBallIntent(player, snapshot, players, holder, court, memory, teamGroups) {
    const basket = attackBasketFor(player.teamId, snapshot, court);
    const defenders = players.filter((candidate) => candidate.teamId !== player.teamId);
    const role = roleFor(
      player,
      (teamGroups.get(player.teamId) || []).findIndex((candidate) => candidate.id === player.id),
    );
    const hoopDistance = distance(player, basket);
    const defenderDistance = closestTo(player, defenders).distance;
    const holderDistance = holder ? distance(player, holder) : Infinity;

    memory.cutCommitment = Math.max(0, memory.cutCommitment - 0.01);
    const laneOpen = this.#laneScore(player, basket, defenders) > 0.7;
    const cutWindow = holder && holderDistance < 8
      && hoopDistance > 2.5
      && laneOpen
      && defenderDistance > 1.2
      && this.random() < this.tuning.cutFrequency * 0.03;

    if (cutWindow || memory.cutCommitment > 0) {
      memory.cutCommitment = Math.max(memory.cutCommitment, 1);
      const target = lerp(positionOf(player), basket, 0.82);
      if (distance(player, target) < 0.8 || hoopDistance < 1.65) memory.cutCommitment = 0;
      this.#setState(memory, AI_STATES.CUT, "backdoor cut");
      return this.#intent(player, memory, target, this.tuning.moveSpeed, holder || basket, {
        type: "requestPass",
        urgency: 0.82,
      });
    }

    if (role === AI_ROLES.BIG && holder && holderDistance < 5.2 && holderDistance > 2.1) {
      const onBallDefender = closestTo(holder, defenders).player;
      if (onBallDefender && memory.stateSeconds > 1.1 && this.random() < 0.018) {
        const screenDirection = normalized(subtract(positionOf(holder), positionOf(basket)));
        const target = add(positionOf(onBallDefender), multiply(screenDirection, 0.85));
        this.#setState(memory, AI_STATES.SCREEN, "set on-ball screen");
        const action = distance(player, target) < 0.45 ? { type: "setScreen" } : null;
        return this.#intent(player, memory, target, 0.66, holder, action);
      }
    }

    const teammates = teamGroups.get(player.teamId) || [];
    const index = Math.max(0, teammates.findIndex((candidate) => candidate.id === player.id));
    const target = this.#spacingTarget(player, index, teammates.length, holder, basket, court, role);
    this.#setState(memory, AI_STATES.OFF_BALL_SPACE, "maintain passing window");
    const action = defenderDistance > 2.6 && holderDistance < 9
      ? { type: "showHands", openness: clamp(defenderDistance / 4) }
      : null;
    return this.#intent(player, memory, target, 0.72, holder || basket, action, {
      defenderDistance,
      spacingIndex: index,
    });
  }

  #defensiveIntent(player, snapshot, players, holder, court, memory) {
    const offense = players.filter((candidate) => candidate.teamId !== player.teamId);
    const ownBasket = holder
      ? attackBasketFor(holder.teamId, snapshot, court)
      : attackBasketFor(snapshot.offenseTeamId, snapshot, court);
    const assignment = offense.find((candidate) => candidate.id === memory.matchupId)
      || closestTo(player, offense).player;
    const ballPosition = holder ? positionOf(holder) : positionOf(snapshot.ball);

    if (!assignment) {
      this.#setState(memory, AI_STATES.TRANSITION_DEFENSE, "protect basket");
      return this.#intent(player, memory, lerp(ballPosition, ownBasket, 0.58), 0.86, ballPosition);
    }

    const assignmentDistance = distance(player, assignment);
    const ballDistance = distance(player, ballPosition);
    const isOnBall = holder?.id === assignment.id;
    const shotThreat = Boolean(assignment.isShooting || snapshot.shooterId === assignment.id);

    if (shotThreat && assignmentDistance <= this.tuning.contestRange + 0.75) {
      this.#setState(memory, AI_STATES.CONTEST, "contest release");
      const action = assignmentDistance <= this.tuning.contestRange
        ? {
            type: distance(assignment, ownBasket) < 2.4 ? "block" : "contest",
            targetPlayerId: assignment.id,
            intensity: this.tuning.contestUrgency,
            successBias: this.tuning.blockRate,
          }
        : null;
      return this.#intent(player, memory, assignment, 1, assignment, action);
    }

    if (isOnBall) {
      const hoopDirection = normalized(subtract(ownBasket, positionOf(assignment)));
      const cushion = clamp(
        this.tuning.defensiveCushion
          + (distance(assignment, ownBasket) > court.threePointRadius ? -0.45 : 0),
        0.8,
        2.5,
      );
      const target = add(positionOf(assignment), multiply(hoopDirection, cushion));
      let action = null;
      if (assignmentDistance < 1.35
        && memory.stealCooldown <= 0
        && memory.actionCooldown <= 0
        && this.random() < this.tuning.stealRate * 0.12) {
        memory.stealCooldown = 1.45 + this.random() * 0.8;
        memory.actionCooldown = 0.42;
        action = {
          type: "steal",
          targetPlayerId: assignment.id,
          discipline: this.tuning.shotDiscipline,
        };
      } else if (assignmentDistance < 2.4) {
        action = { type: "defensiveStance", shade: memory.sidePreference };
      }
      this.#setState(memory, AI_STATES.ON_BALL_DEFENSE, "contain ball handler");
      return this.#intent(player, memory, clampToCourt(target, court), this.tuning.moveSpeed, assignment, action, {
        cushion,
        assignmentDistance,
      });
    }

    const holderToHoop = distance(holder || ballPosition, ownBasket);
    const assignmentToHoop = distance(assignment, ownBasket);
    const helpNeeded = holder
      && holderToHoop < 4.8
      && ballDistance < this.tuning.helpDistance
      && assignmentToHoop > 3.5;
    if (helpNeeded) {
      const helpTarget = lerp(ballPosition, ownBasket, 0.38);
      this.#setState(memory, AI_STATES.HELP, "tag drive");
      const action = ballDistance < 1.75 ? { type: "showHelp", recoverTo: assignment.id } : null;
      return this.#intent(player, memory, helpTarget, 0.94, holder, action);
    }

    const denialAmount = distance(assignment, ballPosition) < 6 ? 0.38 : 0.23;
    const denialTarget = lerp(positionOf(assignment), ballPosition, denialAmount);
    const basketSafety = lerp(denialTarget, ownBasket, assignmentToHoop < 3 ? 0.18 : 0.08);
    this.#setState(memory, AI_STATES.DENY, "deny passing lane");
    return this.#intent(player, memory, clampToCourt(basketSafety, court), 0.78, assignment, {
      type: "deny",
      targetPlayerId: assignment.id,
    }, { assignmentDistance });
  }

  #laneScore(player, basket, defenders) {
    const start = positionOf(player);
    const finish = positionOf(basket);
    const segment = subtract(finish, start);
    const segmentLengthSquared = segment.x * segment.x + segment.z * segment.z || 1;
    let nearestLaneDefender = Infinity;
    for (const defender of defenders) {
      const relative = subtract(positionOf(defender), start);
      const projection = clamp(
        (relative.x * segment.x + relative.z * segment.z) / segmentLengthSquared,
      );
      const point = add(start, multiply(segment, projection));
      nearestLaneDefender = Math.min(nearestLaneDefender, distance(defender, point));
    }
    return clamp((nearestLaneDefender - 0.55) / 2.6);
  }

  #shotQuality(player, basket, defenderDistance, snapshot) {
    const d = distance(player, basket);
    const rangeQuality = d < 2
      ? 0.92
      : d < 5.2
        ? 0.78
        : d < (snapshot.court?.threePointRadius || DEFAULT_COURT.threePointRadius) + 0.8
          ? 0.72
          : 0.48;
    const openness = clamp((defenderDistance - 0.65) / 3);
    const skill = clamp(player.shooting ?? player.ratings?.shooting ?? 0.72);
    const stamina = clamp(player.stamina ?? 1);
    const discipline = this.tuning.shotDiscipline;
    const noise = (this.random() - 0.5) * this.tuning.errorRate;
    return clamp(
      rangeQuality * 0.36
      + openness * 0.29
      + skill * 0.24
      + stamina * 0.11
      + (discipline - 0.75) * 0.08
      + noise,
    );
  }

  #bestPass(player, teammates, defenders, basket, snapshot) {
    let best = null;
    for (const teammate of teammates) {
      const separation = closestTo(teammate, defenders).distance;
      const passDistance = distance(player, teammate);
      if (passDistance > 12 || passDistance < 1.1) continue;
      const velocity = positionOf(teammate.velocity);
      const leadTarget = add(positionOf(teammate), multiply(velocity, clamp(passDistance / 13, 0.08, 0.48)));
      const lane = this.#passLaneSafety(player, leadTarget, defenders);
      const rimPressure = 1 - clamp(distance(teammate, basket) / 12);
      const shooter = clamp(teammate.shooting ?? teammate.ratings?.shooting ?? 0.7);
      const openness = clamp((separation - 0.65) / 3.1);
      const score = lane * 0.36 + openness * 0.28 + rimPressure * 0.18 + shooter * 0.18
        - this.tuning.errorRate * this.random();
      if (!best || score > best.score) {
        best = {
          player: teammate,
          leadTarget,
          score,
          type: passDistance > 7 ? "lob" : rimPressure > 0.7 ? "bounce" : "chest",
        };
      }
    }
    return best;
  }

  #passLaneSafety(passer, target, defenders) {
    const start = positionOf(passer);
    const segment = subtract(target, start);
    const segmentLengthSquared = segment.x * segment.x + segment.z * segment.z || 1;
    let clearance = Infinity;
    for (const defender of defenders) {
      const relative = subtract(positionOf(defender), start);
      const t = clamp((relative.x * segment.x + relative.z * segment.z) / segmentLengthSquared);
      clearance = Math.min(clearance, distance(defender, add(start, multiply(segment, t))));
    }
    return clamp((clearance - 0.35) / 2);
  }

  #spacingTarget(player, index, count, holder, basket, court, role) {
    const attackSign = Math.sign(basket.z) || 1;
    const slots = count <= 2
      ? [
          { x: -court.halfWidth * 0.55, z: basket.z - attackSign * 5.6 },
          { x: court.halfWidth * 0.55, z: basket.z - attackSign * 5.6 },
        ]
      : [
          { x: -court.halfWidth * 0.68, z: basket.z - attackSign * 4.8 },
          { x: court.halfWidth * 0.68, z: basket.z - attackSign * 4.8 },
          { x: 0, z: basket.z - attackSign * 7.1 },
          { x: -court.halfWidth * 0.52, z: basket.z - attackSign * 7.3 },
          { x: court.halfWidth * 0.52, z: basket.z - attackSign * 7.3 },
        ];
    let slot = { ...slots[index % slots.length] };
    if (role === AI_ROLES.BIG) {
      slot = {
        x: (index % 2 ? 1 : -1) * 2.15,
        z: basket.z - attackSign * 3.25,
      };
    }
    if (holder && distance(holder, slot) < 2.3) {
      slot.x = -slot.x || (index % 2 ? 3.5 : -3.5);
    }
    return clampToCourt(slot, court);
  }

  #assignDefensiveMatchups(players, offenseTeamId) {
    if (offenseTeamId == null) return;
    const offense = players.filter((player) => player.teamId === offenseTeamId);
    const defense = players.filter((player) => player.teamId !== offenseTeamId);
    const remaining = new Set(offense.map((player) => player.id));
    const orderedDefense = [...defense].sort((a, b) => {
      const aRole = roleFor(a) === AI_ROLES.BIG ? -1 : 0;
      const bRole = roleFor(b) === AI_ROLES.BIG ? -1 : 0;
      return aRole - bRole;
    });
    for (const defender of orderedDefense) {
      const memory = this.#memoryFor(defender);
      const current = offense.find((candidate) => candidate.id === memory.matchupId);
      if (current && remaining.has(current.id) && roleFor(current) === roleFor(defender)) {
        remaining.delete(current.id);
        continue;
      }
      const candidates = offense.filter((candidate) => remaining.has(candidate.id));
      const sameRole = candidates.filter((candidate) => roleFor(candidate) === roleFor(defender));
      const choice = closestTo(defender, sameRole.length ? sameRole : candidates).player;
      memory.matchupId = choice?.id ?? null;
      if (choice) remaining.delete(choice.id);
    }
  }
}

export function createAIDirector(options) {
  return new BasketballAIDirector(options);
}

export function getDifficultyTuning(name = "pro") {
  return { ...(DIFFICULTY_PRESETS[name] || DIFFICULTY_PRESETS.pro) };
}

export default BasketballAIDirector;
