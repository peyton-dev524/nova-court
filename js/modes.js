/**
 * Nova Court game-mode rules.
 *
 * Controllers are event driven and contain no renderer or physics dependency.
 * The engine should:
 *   1. createGameMode(id, config)
 *   2. mode.start({ teamIds, userTeamId, rosters })
 *   3. call mode.update(deltaSeconds) every simulation tick
 *   4. forward authoritative outcomes through mode.handleEvent(event)
 *   5. apply commands returned from handleEvent/update or consumeCommands()
 *
 * Event may be "BASKET" plus payload, or { type:"BASKET", ...payload }.
 * Commands use types such as SET_POSSESSION, BEGIN_CHECK, SPAWN_RACK_BALL,
 * SET_BALL_LIVE, END_GAME, and ANNOUNCE. Commands are hints for integration;
 * mode state is authoritative for scoring, clocks, and completion.
 */

export const MODE_IDS = Object.freeze({
  STREET_1V1: "street_1v1",
  THREE_POINT_CONTEST: "three_point_contest",
  HALF_COURT_3V3: "half_court_3v3",
  HALF_COURT_4V4: "half_court_4v4",
});

export const MODE_PHASES = Object.freeze({
  READY: "ready",
  COUNTDOWN: "countdown",
  CHECK: "check",
  INBOUND: "inbound",
  LIVE: "live",
  PAUSED: "paused",
  FINISHED: "finished",
});

export const MODE_CATALOG = Object.freeze([
  Object.freeze({
    id: MODE_IDS.STREET_1V1,
    name: "Neon King",
    shortName: "1v1",
    description: "Make-it-take-it street basketball. First to 11, win by two.",
    players: "1 vs 1",
    icon: "crown",
  }),
  Object.freeze({
    id: MODE_IDS.THREE_POINT_CONTEST,
    name: "Arc Circuit",
    shortName: "3PT",
    description: "Five timed racks, money balls, and a selectable all-value rack.",
    players: "Solo",
    icon: "arc",
  }),
  Object.freeze({
    id: MODE_IDS.HALF_COURT_3V3,
    name: "Pulse 3s",
    shortName: "3v3",
    description: "Half-court team play with passing, clears, assists, and a shot clock.",
    players: "3 vs 3",
    icon: "team",
  }),
  Object.freeze({
    id: MODE_IDS.HALF_COURT_4V4,
    name: "Nova Fours",
    shortName: "4v4",
    description: "Four-out half-court team play with pass-gated dead-ball inbounds.",
    players: "4 vs 4",
    icon: "team",
  }),
]);

const EVENT_ALIASES = Object.freeze({
  SCORE: "BASKET",
  MADE_SHOT: "BASKET",
  SHOT_MADE: "BASKET",
  SHOT_MISS: "MISS",
  MISSED_SHOT: "MISS",
  BOARD: "REBOUND",
  GIVEAWAY: "TURNOVER",
  CHECK: "CHECK_COMPLETE",
  CLEAR: "CLEAR_COMPLETE",
  PASS: "PASS_COMPLETE",
});

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function asPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeEvent(eventOrType, payload = {}) {
  const event = typeof eventOrType === "string"
    ? { ...payload, type: eventOrType }
    : { ...(eventOrType || {}) };
  const rawType = String(event.type || "").trim().toUpperCase();
  event.type = EVENT_ALIASES[rawType] || rawType;
  return event;
}

function otherTeam(teamId, teamIds) {
  return teamIds.find((id) => id !== teamId) ?? teamIds[0] ?? null;
}

function cloneScores(scores) {
  return Object.fromEntries(Object.entries(scores));
}

function blankScores(teamIds) {
  return Object.fromEntries(teamIds.map((id) => [id, 0]));
}

function scoreWinner(scores, teamIds, target, winBy = 1, cap = Infinity) {
  const [a, b] = teamIds;
  const aScore = scores[a] || 0;
  const bScore = scores[b] || 0;
  if (aScore >= cap || bScore >= cap) return aScore >= cap ? a : b;
  if (Math.max(aScore, bScore) < target) return null;
  if (Math.abs(aScore - bScore) < winBy) return null;
  return aScore > bScore ? a : b;
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function shotValue(event, insideValue = 1, outsideValue = 2) {
  if (Number.isFinite(event.points)) return Math.max(0, Math.floor(event.points));
  return event.isThree || event.zone === "three" || event.distanceClass === "outside"
    ? outsideValue
    : insideValue;
}

class BaseMode {
  constructor(id, config = {}) {
    this.id = id;
    this.config = { ...config };
    this.teamIds = [...(config.teamIds || ["home", "away"])];
    this.userTeamId = config.userTeamId ?? this.teamIds[0];
    this.difficulty = config.difficulty || "pro";
    this.phase = MODE_PHASES.READY;
    this.previousPhase = null;
    this.result = null;
    this.commands = [];
    this.elapsed = 0;
    this.runNumber = 0;
    this.startContext = {};
  }

  start(context = {}) {
    this.startContext = { ...this.startContext, ...context };
    if (Array.isArray(context.teamIds) && context.teamIds.length) {
      this.teamIds = [...context.teamIds];
    }
    if (context.userTeamId != null) this.userTeamId = context.userTeamId;
    return this.restart();
  }

  restart() {
    this.runNumber += 1;
    this.elapsed = 0;
    this.result = null;
    this.commands.length = 0;
    this.#setPhase(MODE_PHASES.READY);
    this.resetState();
    return this.#response(true);
  }

  rematch(options = {}) {
    if (options.swapSides && this.teamIds.length === 2) {
      this.teamIds.reverse();
    }
    return this.restart();
  }

  pause() {
    if (this.phase === MODE_PHASES.LIVE
      || this.phase === MODE_PHASES.CHECK
      || this.phase === MODE_PHASES.INBOUND
      || this.phase === MODE_PHASES.COUNTDOWN) {
      this.previousPhase = this.phase;
      this.phase = MODE_PHASES.PAUSED;
      this.emit("PAUSE_PLAY");
      return true;
    }
    return false;
  }

  resume() {
    if (this.phase !== MODE_PHASES.PAUSED) return false;
    this.phase = this.previousPhase || MODE_PHASES.LIVE;
    this.previousPhase = null;
    this.emit("RESUME_PLAY");
    return true;
  }

  setDifficulty(difficulty) {
    this.difficulty = difficulty || "pro";
  }

  update(deltaSeconds) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.1);
    if (this.phase !== MODE_PHASES.PAUSED && this.phase !== MODE_PHASES.FINISHED) {
      this.elapsed += dt;
      this.tick(dt);
    }
    return this.#response(true);
  }

  handleEvent(eventOrType, payload = {}) {
    const event = normalizeEvent(eventOrType, payload);
    if (!event.type) return this.#response(false, "missing_event_type");
    if (event.type === "PAUSE") return this.#response(this.pause());
    if (event.type === "RESUME") return this.#response(this.resume());
    if (event.type === "RESTART") return this.restart();
    if (event.type === "REMATCH") return this.rematch(event);
    if (this.phase === MODE_PHASES.PAUSED || this.phase === MODE_PHASES.FINISHED) {
      return this.#response(false, "mode_not_accepting_gameplay");
    }
    return this.#response(this.onEvent(event));
  }

  consumeCommands() {
    const commands = this.commands;
    this.commands = [];
    return commands;
  }

  emit(type, payload = {}) {
    this.commands.push({ type, ...payload });
  }

  finish(winnerTeamId, reason, extra = {}) {
    this.result = {
      winnerTeamId,
      outcome: winnerTeamId == null
        ? "complete"
        : winnerTeamId === this.userTeamId ? "win" : "loss",
      reason,
      ...extra,
    };
    this.#setPhase(MODE_PHASES.FINISHED);
    this.emit("END_GAME", { result: { ...this.result } });
  }

  getState() {
    return {
      id: this.id,
      phase: this.phase,
      difficulty: this.difficulty,
      elapsed: this.elapsed,
      runNumber: this.runNumber,
      result: this.result ? { ...this.result } : null,
    };
  }

  getUIState() {
    return this.getState();
  }

  getRules() {
    return { id: this.id };
  }

  getAIContext() {
    return {
      difficulty: this.difficulty,
      phase: this.phase,
    };
  }

  // Subclass hooks.
  resetState() {}
  tick() {}
  onEvent() { return false; }

  #setPhase(phase) {
    this.previousPhase = this.phase;
    this.phase = phase;
  }

  setPhase(phase) {
    this.#setPhase(phase);
  }

  #response(accepted, reason = null) {
    return {
      accepted: Boolean(accepted),
      reason,
      state: this.getState(),
      commands: this.consumeCommands(),
    };
  }
}

export class StreetOneOnOneMode extends BaseMode {
  constructor(config = {}) {
    super(MODE_IDS.STREET_1V1, config);
    this.targetScore = asPositiveNumber(config.targetScore, 11);
    this.winBy = asPositiveNumber(config.winBy, 2);
    this.scoreCap = asPositiveNumber(config.scoreCap, 15);
    this.shotClockDuration = asPositiveNumber(config.shotClock, 21);
    this.checkDelay = asPositiveNumber(config.checkDelay, 0.75);
    this.initialOffenseTeamId = config.initialOffenseTeamId ?? this.teamIds[0];
  }

  resetState() {
    this.scores = blankScores(this.teamIds);
    this.possessionTeamId = this.initialOffenseTeamId ?? this.teamIds[0];
    this.lastScoringTeamId = null;
    this.shotClock = this.shotClockDuration;
    this.checkTimer = 0;
    this.possessionNumber = 1;
    this.setPhase(MODE_PHASES.CHECK);
    this.emit("BEGIN_CHECK", {
      offenseTeamId: this.possessionTeamId,
      checkerTeamId: otherTeam(this.possessionTeamId, this.teamIds),
      reason: "opening_check",
    });
  }

  tick(dt) {
    if (this.phase === MODE_PHASES.LIVE) {
      this.shotClock = Math.max(0, this.shotClock - dt);
      if (this.shotClock <= 0) {
        this.#changePossession("shot_clock");
      }
    } else if (this.phase === MODE_PHASES.CHECK && this.checkTimer > 0) {
      this.checkTimer = Math.max(0, this.checkTimer - dt);
      if (this.checkTimer === 0) {
        this.emit("CHECK_AVAILABLE", { offenseTeamId: this.possessionTeamId });
      }
    }
  }

  onEvent(event) {
    switch (event.type) {
      case "CHECK_COMPLETE":
        if (this.phase !== MODE_PHASES.CHECK || this.checkTimer > 0) return false;
        if (event.offenseTeamId != null && event.offenseTeamId !== this.possessionTeamId) return false;
        this.setPhase(MODE_PHASES.LIVE);
        this.shotClock = this.shotClockDuration;
        this.emit("SET_BALL_LIVE", {
          offenseTeamId: this.possessionTeamId,
          possessionNumber: this.possessionNumber,
        });
        return true;
      case "BASKET": {
        if (this.phase !== MODE_PHASES.LIVE || event.teamId !== this.possessionTeamId) return false;
        const points = shotValue(event);
        this.scores[event.teamId] = (this.scores[event.teamId] || 0) + points;
        this.lastScoringTeamId = event.teamId;
        this.emit("SCORE_CONFIRMED", { teamId: event.teamId, points, scores: cloneScores(this.scores) });
        const winner = scoreWinner(
          this.scores,
          this.teamIds,
          this.targetScore,
          this.winBy,
          this.scoreCap,
        );
        if (winner != null) {
          this.finish(winner, "target_score", { scores: cloneScores(this.scores) });
        } else {
          // Make-it-take-it: scorer keeps the ball after a defensive check.
          this.#beginCheck(event.teamId, "make_it_take_it");
        }
        return true;
      }
      case "REBOUND":
        if (this.phase !== MODE_PHASES.LIVE || event.teamId == null) return false;
        if (event.teamId !== this.possessionTeamId) this.#changePossession("defensive_rebound");
        else this.emit("RESET_SHOT_CLOCK", { seconds: Math.min(8, this.shotClockDuration) });
        return true;
      case "TURNOVER":
      case "STEAL":
      case "OUT_OF_BOUNDS":
        if (this.phase !== MODE_PHASES.LIVE) return false;
        this.#changePossession(event.type.toLowerCase(), event.teamId);
        return true;
      case "SHOT_CLOCK_EXPIRED":
        if (this.phase !== MODE_PHASES.LIVE) return false;
        this.#changePossession("shot_clock");
        return true;
      case "FOUL":
        if (this.phase !== MODE_PHASES.LIVE) return false;
        this.#beginCheck(event.offendedTeamId ?? this.possessionTeamId, event.foulType || "foul");
        return true;
      case "MISS":
      case "BLOCK":
      case "SHOT_ATTEMPT":
        return this.phase === MODE_PHASES.LIVE;
      default:
        return false;
    }
  }

  #changePossession(reason, creditedTeamId = null) {
    const nextTeam = creditedTeamId != null && creditedTeamId !== this.possessionTeamId
      ? creditedTeamId
      : otherTeam(this.possessionTeamId, this.teamIds);
    this.#beginCheck(nextTeam, reason);
  }

  #beginCheck(teamId, reason) {
    this.possessionTeamId = teamId;
    this.possessionNumber += 1;
    this.shotClock = this.shotClockDuration;
    this.checkTimer = this.checkDelay;
    this.setPhase(MODE_PHASES.CHECK);
    this.emit("SET_POSSESSION", { teamId, reason, possessionNumber: this.possessionNumber });
    this.emit("BEGIN_CHECK", {
      offenseTeamId: teamId,
      checkerTeamId: otherTeam(teamId, this.teamIds),
      reason,
    });
  }

  getState() {
    return {
      ...super.getState(),
      scores: cloneScores(this.scores || {}),
      possessionTeamId: this.possessionTeamId,
      possessionNumber: this.possessionNumber,
      shotClock: this.shotClock,
      targetScore: this.targetScore,
    };
  }

  getUIState() {
    return {
      ...this.getState(),
      title: "Neon King",
      clockText: String(Math.ceil(this.shotClock)),
      scoreText: this.teamIds.map((id) => `${id}: ${this.scores[id] || 0}`).join("  "),
      statusText: this.phase === MODE_PHASES.CHECK
        ? `${this.possessionTeamId} ball — check up`
        : this.phase === MODE_PHASES.FINISHED
          ? (this.result?.outcome === "win" ? "Court claimed" : "Run it back")
          : "Make it, keep it",
      prompt: this.phase === MODE_PHASES.CHECK ? "Complete the check to play" : null,
    };
  }

  getRules() {
    return {
      id: this.id,
      playersPerTeam: 1,
      targetScore: this.targetScore,
      winBy: this.winBy,
      cap: this.scoreCap,
      insidePoints: 1,
      outsidePoints: 2,
      makeItTakeIt: true,
      shotClock: this.shotClockDuration,
      possessionStartsWithCheck: true,
    };
  }

  getAIContext() {
    return {
      ...super.getAIContext(),
      offenseTeamId: this.possessionTeamId,
      shotClock: this.shotClock,
      possessionId: this.possessionNumber,
      phase: this.phase === MODE_PHASES.CHECK ? "check" : this.phase,
      style: "isolation",
    };
  }
}

const DEFAULT_RACKS = Object.freeze([
  Object.freeze({ id: "left_corner", label: "Left Corner", x: -6.6, z: 2.1 }),
  Object.freeze({ id: "left_wing", label: "Left Wing", x: -5.3, z: 5.1 }),
  Object.freeze({ id: "top", label: "Top", x: 0, z: 7.05 }),
  Object.freeze({ id: "right_wing", label: "Right Wing", x: 5.3, z: 5.1 }),
  Object.freeze({ id: "right_corner", label: "Right Corner", x: 6.6, z: 2.1 }),
]);

export class ThreePointContestMode extends BaseMode {
  constructor(config = {}) {
    super(MODE_IDS.THREE_POINT_CONTEST, config);
    this.duration = asPositiveNumber(config.duration, 60);
    this.countdownDuration = asPositiveNumber(config.countdown, 3);
    this.targetScore = asPositiveNumber(config.targetScore, 18);
    this.ballsPerRack = Math.max(1, Math.floor(asPositiveNumber(config.ballsPerRack, 5)));
    this.moneyRackIndex = clamp(
      Math.floor(Number(config.moneyRackIndex) || 2),
      0,
      DEFAULT_RACKS.length - 1,
    );
    this.racks = (config.racks || DEFAULT_RACKS).map((rack, index) => ({
      ...rack,
      id: rack.id || `rack_${index}`,
    }));
    this.shotResolveTimeout = asPositiveNumber(config.shotResolveTimeout, 2.4);
  }

  resetState() {
    this.score = 0;
    this.makes = 0;
    this.attempts = 0;
    this.moneyBallMakes = 0;
    this.clock = this.duration;
    this.countdown = this.countdownDuration;
    this.rackIndex = 0;
    this.ballIndex = 0;
    this.pendingShot = null;
    this.finishedRacks = [];
    this.rackStats = this.racks.map((rack) => ({
      rackId: rack.id,
      makes: 0,
      attempts: 0,
      points: 0,
    }));
    this.setPhase(MODE_PHASES.COUNTDOWN);
    this.emit("PLACE_PLAYER", { position: this.racks[0], faceBasket: true });
    this.emit("COUNTDOWN", { seconds: Math.ceil(this.countdown) });
  }

  tick(dt) {
    if (this.phase === MODE_PHASES.COUNTDOWN) {
      const previous = Math.ceil(this.countdown);
      this.countdown = Math.max(0, this.countdown - dt);
      if (Math.ceil(this.countdown) !== previous && this.countdown > 0) {
        this.emit("COUNTDOWN", { seconds: Math.ceil(this.countdown) });
      }
      if (this.countdown === 0) {
        this.setPhase(MODE_PHASES.LIVE);
        this.emit("ANNOUNCE", { text: "LET IT FLY", tone: "start" });
        this.#spawnCurrentBall();
      }
      return;
    }
    if (this.phase !== MODE_PHASES.LIVE) return;
    this.clock = Math.max(0, this.clock - dt);
    if (this.pendingShot) {
      this.pendingShot.timeRemaining -= dt;
      if (this.pendingShot.timeRemaining <= 0) this.#resolveShot(false, { reason: "unresolved" });
    }
    if (this.clock === 0) this.#finishRun("time");
  }

  onEvent(event) {
    switch (event.type) {
      case "SHOT_ATTEMPT":
        if (this.phase !== MODE_PHASES.LIVE || this.pendingShot) return false;
        this.pendingShot = {
          rackIndex: this.rackIndex,
          ballIndex: this.ballIndex,
          value: this.#currentBallValue(),
          shotId: event.shotId ?? `${this.runNumber}-${this.attempts + 1}`,
          timeRemaining: this.shotResolveTimeout,
        };
        this.emit("LOCK_RACK_BALL", {
          rackIndex: this.rackIndex,
          ballIndex: this.ballIndex,
          shotId: this.pendingShot.shotId,
        });
        return true;
      case "BASKET":
        if (this.phase !== MODE_PHASES.LIVE) return false;
        if (!this.pendingShot) this.#createImplicitAttempt(event.shotId);
        this.#resolveShot(true, event);
        return true;
      case "MISS":
      case "BLOCK":
        if (this.phase !== MODE_PHASES.LIVE) return false;
        if (!this.pendingShot) this.#createImplicitAttempt(event.shotId);
        this.#resolveShot(false, event);
        return true;
      case "SKIP_BALL":
        if (this.phase !== MODE_PHASES.LIVE || this.pendingShot) return false;
        this.#createImplicitAttempt(event.shotId);
        this.#resolveShot(false, { reason: "skipped" });
        return true;
      default:
        return false;
    }
  }

  #createImplicitAttempt(shotId) {
    this.pendingShot = {
      rackIndex: this.rackIndex,
      ballIndex: this.ballIndex,
      value: this.#currentBallValue(),
      shotId: shotId ?? `${this.runNumber}-${this.attempts + 1}`,
      timeRemaining: this.shotResolveTimeout,
    };
  }

  #resolveShot(made, event) {
    const shot = this.pendingShot;
    if (!shot) return;
    const stat = this.rackStats[shot.rackIndex];
    this.attempts += 1;
    stat.attempts += 1;
    if (made) {
      this.makes += 1;
      this.score += shot.value;
      stat.makes += 1;
      stat.points += shot.value;
      if (shot.value === 2) this.moneyBallMakes += 1;
    }
    this.emit("CONTEST_SHOT_RESOLVED", {
      made,
      value: shot.value,
      shotId: shot.shotId,
      rackIndex: shot.rackIndex,
      ballIndex: shot.ballIndex,
      score: this.score,
      perfectRelease: Boolean(event.perfectRelease),
    });
    this.pendingShot = null;
    this.#advanceBall();
  }

  #advanceBall() {
    this.ballIndex += 1;
    if (this.ballIndex >= this.ballsPerRack) {
      this.finishedRacks.push(this.rackIndex);
      this.rackIndex += 1;
      this.ballIndex = 0;
      if (this.rackIndex >= this.racks.length) {
        this.#finishRun("all_racks");
        return;
      }
      this.emit("MOVE_TO_RACK", {
        rackIndex: this.rackIndex,
        rack: { ...this.racks[this.rackIndex] },
      });
    }
    this.#spawnCurrentBall();
  }

  #spawnCurrentBall() {
    if (this.phase !== MODE_PHASES.LIVE) return;
    this.emit("SPAWN_RACK_BALL", {
      rackIndex: this.rackIndex,
      ballIndex: this.ballIndex,
      rack: { ...this.racks[this.rackIndex] },
      value: this.#currentBallValue(),
      isMoneyBall: this.#currentBallValue() === 2,
    });
  }

  #currentBallValue() {
    return this.rackIndex === this.moneyRackIndex || this.ballIndex === this.ballsPerRack - 1
      ? 2
      : 1;
  }

  #finishRun(reason) {
    if (this.phase === MODE_PHASES.FINISHED) return;
    if (this.pendingShot) {
      this.pendingShot = null;
    }
    const metTarget = this.score >= this.targetScore;
    this.finish(
      metTarget ? this.userTeamId : null,
      reason,
      {
        outcome: metTarget ? "win" : "loss",
        score: this.score,
        targetScore: this.targetScore,
        makes: this.makes,
        attempts: this.attempts,
      },
    );
  }

  getState() {
    return {
      ...super.getState(),
      score: this.score,
      makes: this.makes,
      attempts: this.attempts,
      moneyBallMakes: this.moneyBallMakes,
      clock: this.clock,
      countdown: this.countdown,
      rackIndex: this.rackIndex,
      ballIndex: this.ballIndex,
      rackStats: (this.rackStats || []).map((stat) => ({ ...stat })),
      pendingShot: this.pendingShot ? { ...this.pendingShot } : null,
      targetScore: this.targetScore,
    };
  }

  getUIState() {
    const currentRack = this.racks[Math.min(this.rackIndex, this.racks.length - 1)];
    return {
      ...this.getState(),
      title: "Arc Circuit",
      scoreText: String(this.score),
      clockText: formatClock(this.clock),
      statusText: this.phase === MODE_PHASES.COUNTDOWN
        ? String(Math.ceil(this.countdown))
        : this.phase === MODE_PHASES.FINISHED
          ? (this.score >= this.targetScore ? "Target cleared" : "Target missed")
          : currentRack?.label || "",
      rackLabel: currentRack?.label || "Complete",
      rackProgress: `${Math.min(this.rackIndex + 1, this.racks.length)}/${this.racks.length}`,
      ballProgress: `${Math.min(this.ballIndex + 1, this.ballsPerRack)}/${this.ballsPerRack}`,
      nextBallValue: this.phase === MODE_PHASES.LIVE ? this.#currentBallValue() : 0,
      targetDelta: this.score - this.targetScore,
    };
  }

  getRules() {
    return {
      id: this.id,
      duration: this.duration,
      countdown: this.countdownDuration,
      targetScore: this.targetScore,
      rackCount: this.racks.length,
      ballsPerRack: this.ballsPerRack,
      moneyRackIndex: this.moneyRackIndex,
      normalBallPoints: 1,
      moneyBallPoints: 2,
      maximumScore: this.racks.length * (this.ballsPerRack + 1)
        + this.ballsPerRack - 1,
    };
  }

  getAIContext() {
    return {
      ...super.getAIContext(),
      style: "shooting_contest",
      clock: this.clock,
      rack: this.racks[this.rackIndex] || null,
      desiredShotType: "jumpShot3",
      noDefense: true,
    };
  }
}

export class HalfCourtThreeOnThreeMode extends BaseMode {
  constructor(config = {}) {
    super(MODE_IDS.HALF_COURT_3V3, config);
    this.playersPerTeam = Math.max(2, Math.floor(asPositiveNumber(config.playersPerTeam, 3)));
    this.modeTitle = config.title || "Pulse 3s";
    this.targetScore = asPositiveNumber(config.targetScore, 15);
    this.winBy = asPositiveNumber(config.winBy, 2);
    this.scoreCap = asPositiveNumber(config.scoreCap, 21);
    this.shotClockDuration = asPositiveNumber(config.shotClock, 21);
    this.gameDuration = asPositiveNumber(config.gameDuration, 300);
    this.checkDelay = asPositiveNumber(config.checkDelay, 0.65);
    this.initialOffenseTeamId = config.initialOffenseTeamId ?? this.teamIds[0];
  }

  resetState() {
    this.scores = blankScores(this.teamIds);
    this.possessionTeamId = this.initialOffenseTeamId ?? this.teamIds[0];
    this.shotClock = this.shotClockDuration;
    this.gameClock = this.gameDuration;
    this.checkTimer = 0;
    this.needsClear = false;
    this.overtime = false;
    this.possessionNumber = 1;
    this.passChain = [];
    this.lastPass = null;
    this.inboundReason = null;
    this.inboundBoundary = null;
    this.setPhase(MODE_PHASES.CHECK);
    this.emit("BEGIN_CHECK", {
      offenseTeamId: this.possessionTeamId,
      checkerTeamId: otherTeam(this.possessionTeamId, this.teamIds),
      reason: "opening_check",
    });
  }

  tick(dt) {
    if (this.phase === MODE_PHASES.LIVE) {
      this.shotClock = Math.max(0, this.shotClock - dt);
      if (!this.overtime) this.gameClock = Math.max(0, this.gameClock - dt);
      if (this.shotClock === 0) this.#changePossession("shot_clock");
      if (this.gameClock === 0 && this.phase === MODE_PHASES.LIVE) this.#handleGameClock();
    } else if (this.phase === MODE_PHASES.CHECK && this.checkTimer > 0) {
      this.checkTimer = Math.max(0, this.checkTimer - dt);
      if (this.checkTimer === 0) {
        this.emit("CHECK_AVAILABLE", { offenseTeamId: this.possessionTeamId });
      }
    }
  }

  onEvent(event) {
    switch (event.type) {
      case "CHECK_COMPLETE":
        if (this.phase !== MODE_PHASES.CHECK || this.checkTimer > 0) return false;
        if (event.offenseTeamId != null && event.offenseTeamId !== this.possessionTeamId) return false;
        this.needsClear = false;
        this.shotClock = this.shotClockDuration;
        this.setPhase(MODE_PHASES.LIVE);
        this.emit("SET_BALL_LIVE", {
          offenseTeamId: this.possessionTeamId,
          possessionNumber: this.possessionNumber,
        });
        return true;
      case "PASS_COMPLETE":
        if (event.teamId !== this.possessionTeamId) return false;
        if (this.phase === MODE_PHASES.INBOUND) {
          const fromPlayerId = event.fromPlayerId ?? event.playerId;
          const toPlayerId = event.toPlayerId ?? event.targetPlayerId;
          if (!fromPlayerId || !toPlayerId || fromPlayerId === toPlayerId) return false;
          this.lastPass = {
            fromPlayerId,
            toPlayerId,
            gameTime: this.gameClock,
            possessionNumber: this.possessionNumber,
          };
          this.passChain.push(this.lastPass);
          this.inboundReason = null;
          this.inboundBoundary = null;
          this.shotClock = this.shotClockDuration;
          this.setPhase(MODE_PHASES.LIVE);
          this.emit("SET_BALL_LIVE", {
            offenseTeamId: this.possessionTeamId,
            possessionNumber: this.possessionNumber,
            receiverPlayerId: toPlayerId,
            reason: "inbound_pass",
          });
          return true;
        }
        if (this.phase !== MODE_PHASES.LIVE) return false;
        this.lastPass = {
          fromPlayerId: event.fromPlayerId ?? event.playerId,
          toPlayerId: event.toPlayerId ?? event.targetPlayerId,
          gameTime: this.gameClock,
          possessionNumber: this.possessionNumber,
        };
        this.passChain.push(this.lastPass);
        if (this.passChain.length > 8) this.passChain.shift();
        this.emit("PASS_TRACKED", { ...this.lastPass, chainLength: this.passChain.length });
        return true;
      case "BASKET": {
        if (this.phase !== MODE_PHASES.LIVE || event.teamId !== this.possessionTeamId) return false;
        if (this.needsClear) {
          this.emit("BASKET_WAVED_OFF", { reason: "ball_not_cleared", teamId: event.teamId });
          this.#changePossession("uncleared_violation");
          return true;
        }
        const points = shotValue(event);
        this.scores[event.teamId] = (this.scores[event.teamId] || 0) + points;
        const assist = this.#assistFor(event);
        this.emit("SCORE_CONFIRMED", {
          teamId: event.teamId,
          playerId: event.playerId,
          points,
          assistPlayerId: assist?.fromPlayerId ?? null,
          scores: cloneScores(this.scores),
        });
        const winner = scoreWinner(
          this.scores,
          this.teamIds,
          this.targetScore,
          this.winBy,
          this.scoreCap,
        );
        if (winner != null) {
          this.finish(winner, "target_score", { scores: cloneScores(this.scores) });
        } else {
          this.#beginCheck(otherTeam(event.teamId, this.teamIds), "made_basket");
        }
        return true;
      }
      case "REBOUND":
        if (this.phase !== MODE_PHASES.LIVE || event.teamId == null) return false;
        if (event.teamId === this.possessionTeamId) {
          this.shotClock = Math.min(12, this.shotClockDuration);
          this.emit("RESET_SHOT_CLOCK", { seconds: this.shotClock, reason: "offensive_rebound" });
        } else {
          this.#setLivePossession(event.teamId, "defensive_rebound", true);
        }
        return true;
      case "STEAL":
      case "TURNOVER": {
        if (this.phase !== MODE_PHASES.LIVE) return false;
        const nextTeam = event.teamId != null && event.teamId !== this.possessionTeamId
          ? event.teamId
          : otherTeam(this.possessionTeamId, this.teamIds);
        this.#setLivePossession(nextTeam, event.type.toLowerCase(), true);
        return true;
      }
      case "CLEAR_COMPLETE":
        if (this.phase !== MODE_PHASES.LIVE || !this.needsClear) return false;
        if (event.teamId != null && event.teamId !== this.possessionTeamId) return false;
        this.needsClear = false;
        this.emit("BALL_CLEARED", { teamId: this.possessionTeamId });
        return true;
      case "OUT_OF_BOUNDS": {
        if (this.phase !== MODE_PHASES.LIVE) return false;
        const awarded = event.awardedTeamId
          ?? otherTeam(event.lastTouchedTeamId ?? this.possessionTeamId, this.teamIds);
        this.#beginInbound(awarded, "out_of_bounds", event.boundary);
        return true;
      }
      case "FOUL":
        if (this.phase !== MODE_PHASES.LIVE) return false;
        this.#beginInbound(event.offendedTeamId ?? this.possessionTeamId, "foul", event.boundary);
        return true;
      case "SHOT_CLOCK_EXPIRED":
        if (this.phase !== MODE_PHASES.LIVE) return false;
        this.#changePossession("shot_clock");
        return true;
      case "MISS":
      case "BLOCK":
      case "SHOT_ATTEMPT":
        return this.phase === MODE_PHASES.LIVE;
      default:
        return false;
    }
  }

  #assistFor(event) {
    if (!this.lastPass || this.lastPass.toPlayerId !== event.playerId) return null;
    if (this.lastPass.possessionNumber !== this.possessionNumber) return null;
    const elapsedGameTime = this.lastPass.gameTime - this.gameClock;
    return elapsedGameTime <= 4.5 ? this.lastPass : null;
  }

  #setLivePossession(teamId, reason, needsClear) {
    this.possessionTeamId = teamId;
    this.possessionNumber += 1;
    this.needsClear = Boolean(needsClear);
    this.shotClock = this.shotClockDuration;
    this.passChain = [];
    this.lastPass = null;
    this.emit("SET_POSSESSION", {
      teamId,
      reason,
      possessionNumber: this.possessionNumber,
      needsClear: this.needsClear,
    });
    if (this.needsClear) {
      this.emit("REQUIRE_CLEAR", { teamId, clearBeyondArc: true });
    }
  }

  #beginCheck(teamId, reason) {
    this.#setLivePossession(teamId, reason, false);
    this.checkTimer = this.checkDelay;
    this.setPhase(MODE_PHASES.CHECK);
    this.emit("BEGIN_CHECK", {
      offenseTeamId: teamId,
      checkerTeamId: otherTeam(teamId, this.teamIds),
      reason,
    });
  }

  #beginInbound(teamId, reason, boundary = "baseline") {
    this.#setLivePossession(teamId, reason, false);
    this.inboundReason = reason;
    this.inboundBoundary = boundary || "baseline";
    this.setPhase(MODE_PHASES.INBOUND);
    this.emit("BEGIN_INBOUND", {
      offenseTeamId: teamId,
      reason,
      boundary: this.inboundBoundary,
      possessionNumber: this.possessionNumber,
      requiresPass: true,
    });
  }

  #changePossession(reason) {
    this.#beginCheck(otherTeam(this.possessionTeamId, this.teamIds), reason);
  }

  #handleGameClock() {
    const [a, b] = this.teamIds;
    if ((this.scores[a] || 0) === (this.scores[b] || 0)) {
      this.overtime = true;
      this.gameClock = 0;
      this.emit("ANNOUNCE", { text: "SUDDEN DEATH", tone: "overtime" });
      this.emit("OVERTIME_STARTED", { target: "next_score" });
      return;
    }
    const winner = (this.scores[a] || 0) > (this.scores[b] || 0) ? a : b;
    this.finish(winner, "game_clock", { scores: cloneScores(this.scores) });
  }

  getState() {
    return {
      ...super.getState(),
      scores: cloneScores(this.scores || {}),
      possessionTeamId: this.possessionTeamId,
      possessionNumber: this.possessionNumber,
      shotClock: this.shotClock,
      gameClock: this.gameClock,
      needsClear: this.needsClear,
      overtime: this.overtime,
      passChainLength: this.passChain?.length || 0,
      inboundReason: this.inboundReason,
      inboundBoundary: this.inboundBoundary,
      targetScore: this.targetScore,
    };
  }

  getUIState() {
    return {
      ...this.getState(),
      title: this.modeTitle,
      clockText: this.overtime ? "OT" : formatClock(this.gameClock),
      shotClockText: String(Math.ceil(this.shotClock)),
      scoreText: this.teamIds.map((id) => `${id}: ${this.scores[id] || 0}`).join("  "),
      statusText: this.phase === MODE_PHASES.INBOUND
        ? `${this.possessionTeamId} inbound — pass to resume`
        : this.phase === MODE_PHASES.CHECK
        ? `${this.possessionTeamId} ball — check`
        : this.needsClear
          ? "CLEAR THE ARC"
          : this.overtime
            ? "Next score wins"
            : `${this.possessionTeamId} possession`,
      prompt: this.needsClear ? "Take the ball beyond the arc before shooting" : null,
    };
  }

  getRules() {
    return {
      id: this.id,
      playersPerTeam: this.playersPerTeam,
      targetScore: this.targetScore,
      winBy: this.winBy,
      cap: this.scoreCap,
      insidePoints: 1,
      outsidePoints: 2,
      shotClock: this.shotClockDuration,
      gameDuration: this.gameDuration,
      possessionAfterMake: "defense",
      defensiveReboundRequiresClear: true,
      stealRequiresClear: true,
      overtime: "sudden_death",
      assistsTracked: true,
    };
  }

  getAIContext() {
    return {
      ...super.getAIContext(),
      offenseTeamId: this.possessionTeamId,
      shotClock: this.shotClock,
      gameClock: this.gameClock,
      possessionId: this.possessionNumber,
      needsClear: this.needsClear,
      phase: this.phase === MODE_PHASES.CHECK ? "check" : this.phase,
      style: "team_half_court",
    };
  }
}

export function createGameMode(id, config = {}) {
  switch (id) {
    case MODE_IDS.STREET_1V1:
    case "1v1":
    case "street":
      return new StreetOneOnOneMode(config);
    case MODE_IDS.THREE_POINT_CONTEST:
    case "3pt":
    case "contest":
      return new ThreePointContestMode(config);
    case MODE_IDS.HALF_COURT_3V3:
    case "3v3":
    case "half_court":
      return new HalfCourtThreeOnThreeMode(config);
    case MODE_IDS.HALF_COURT_4V4:
    case "4v4": {
      const mode = new HalfCourtThreeOnThreeMode({
        targetScore: 19,
        scoreCap: 25,
        playersPerTeam: 4,
        title: "Nova Fours",
        ...config,
      });
      mode.id = MODE_IDS.HALF_COURT_4V4;
      return mode;
    }
    default:
      throw new RangeError(`Unknown Nova Court mode: ${id}`);
  }
}

export function getModeCatalog() {
  return MODE_CATALOG.map((mode) => ({ ...mode }));
}

export default createGameMode;
