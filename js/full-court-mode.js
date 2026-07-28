import { TEAM_FORMAT_IDS, getTeamFormat, restartSpotForTeam } from "./team-formats.js";

export const FULL_COURT_PHASES = Object.freeze({
  READY: "ready",
  INBOUND: "check",
  LIVE: "live",
  PAUSED: "paused",
  FINISHED: "finished",
});

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const otherTeam = (teamId, teams) => teams.find((id) => id !== teamId) || teams[0];
const copyScores = (scores) => ({ ...scores });

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

export class FullCourtFiveOnFiveMode {
  constructor(config = {}) {
    const preset = getTeamFormat(TEAM_FORMAT_IDS.FULL_FIVE);
    this.id = TEAM_FORMAT_IDS.FULL_FIVE;
    this.difficulty = config.difficulty || "pro";
    this.targetScore = Number(config.targetScore) || preset.targetScore;
    this.scoreCap = Number(config.scoreCap) || preset.scoreCap;
    this.shotClockDuration = Number(config.shotClock) || preset.shotClock;
    this.gameDuration = Number(config.gameDuration) || preset.gameDuration;
    this.inboundDelay = Number(config.inboundDelay) || 0.58;
    this.teamIds = ["home", "away"];
    this.userTeamId = "home";
    this.commands = [];
    this.phase = FULL_COURT_PHASES.READY;
    this.previousPhase = null;
    this.runNumber = 0;
    this.elapsed = 0;
    this.result = null;
  }

  start(context = {}) {
    if (Array.isArray(context.teamIds) && context.teamIds.length === 2) this.teamIds = [...context.teamIds];
    if (context.userTeamId) this.userTeamId = context.userTeamId;
    return this.restart();
  }

  restart() {
    this.runNumber += 1;
    this.elapsed = 0;
    this.result = null;
    this.scores = Object.fromEntries(this.teamIds.map((id) => [id, 0]));
    this.possessionTeamId = this.teamIds[0];
    this.possessionNumber = 1;
    this.shotClock = this.shotClockDuration;
    this.gameClock = this.gameDuration;
    this.inboundTimer = this.inboundDelay;
    this.overtime = false;
    this.finalMinuteAnnounced = false;
    this.lastPass = null;
    this.phase = FULL_COURT_PHASES.INBOUND;
    this.commands.length = 0;
    this.#emitInbound("opening_inbound");
    return this.#response(true);
  }

  rematch() {
    return this.restart();
  }

  pause() {
    if (![FULL_COURT_PHASES.LIVE, FULL_COURT_PHASES.INBOUND].includes(this.phase)) return false;
    this.previousPhase = this.phase;
    this.phase = FULL_COURT_PHASES.PAUSED;
    return true;
  }

  resume() {
    if (this.phase !== FULL_COURT_PHASES.PAUSED) return false;
    this.phase = this.previousPhase || FULL_COURT_PHASES.LIVE;
    this.previousPhase = null;
    return true;
  }

  update(deltaSeconds) {
    const dt = clamp(Number(deltaSeconds) || 0, 0, 0.1);
    if ([FULL_COURT_PHASES.PAUSED, FULL_COURT_PHASES.FINISHED].includes(this.phase)) {
      return this.#response(true);
    }
    this.elapsed += dt;
    if (this.phase === FULL_COURT_PHASES.INBOUND) {
      this.inboundTimer = Math.max(0, this.inboundTimer - dt);
      if (this.inboundTimer === 0) {
        this.phase = FULL_COURT_PHASES.LIVE;
        this.shotClock = this.shotClockDuration;
        this.#emit("SET_BALL_LIVE", {
          offenseTeamId: this.possessionTeamId,
          possessionNumber: this.possessionNumber,
        });
      }
    } else if (this.phase === FULL_COURT_PHASES.LIVE) {
      this.shotClock = Math.max(0, this.shotClock - dt);
      if (!this.overtime) this.gameClock = Math.max(0, this.gameClock - dt);
      if (!this.finalMinuteAnnounced && this.gameClock > 0 && this.gameClock <= 60) {
        this.finalMinuteAnnounced = true;
        this.#emit("ANNOUNCE", { event: "final_minute", text: "FINAL MINUTE", tone: "warning" });
      }
      if (this.shotClock === 0) {
        this.#beginInbound(otherTeam(this.possessionTeamId, this.teamIds), "shot_clock");
      } else if (this.gameClock === 0) {
        this.#finishRegulation();
      }
    }
    return this.#response(true);
  }

  handleEvent(eventOrType, payload = {}) {
    const event = typeof eventOrType === "string"
      ? { ...payload, type: eventOrType }
      : { ...(eventOrType || {}) };
    event.type = String(event.type || "").toUpperCase();
    if (event.type === "PAUSE") return this.#response(this.pause());
    if (event.type === "RESUME") return this.#response(this.resume());
    if (event.type === "RESTART") return this.restart();
    if (this.phase === FULL_COURT_PHASES.PAUSED || this.phase === FULL_COURT_PHASES.FINISHED) {
      return this.#response(false, "mode_not_accepting_gameplay");
    }
    let accepted = false;
    switch (event.type) {
      case "CHECK_COMPLETE":
        if (this.phase === FULL_COURT_PHASES.INBOUND) {
          this.inboundTimer = 0;
          accepted = true;
        }
        break;
      case "PASS_COMPLETE":
        if (this.phase === FULL_COURT_PHASES.LIVE && event.teamId === this.possessionTeamId) {
          this.lastPass = {
            fromPlayerId: event.fromPlayerId ?? event.playerId,
            toPlayerId: event.toPlayerId ?? event.targetPlayerId,
            gameTime: this.gameClock,
            possessionNumber: this.possessionNumber,
          };
          accepted = true;
        }
        break;
      case "BASKET":
      case "SCORE":
      case "MADE_SHOT":
        accepted = this.#basket(event);
        break;
      case "REBOUND":
        accepted = this.#rebound(event);
        break;
      case "STEAL":
      case "TURNOVER":
        if (this.phase === FULL_COURT_PHASES.LIVE) {
          const next = event.teamId && event.teamId !== this.possessionTeamId
            ? event.teamId
            : otherTeam(this.possessionTeamId, this.teamIds);
          this.#livePossession(next, event.type.toLowerCase());
          accepted = true;
        }
        break;
      case "OUT_OF_BOUNDS":
        if (this.phase === FULL_COURT_PHASES.LIVE) {
          const awarded = event.awardedTeamId
            || otherTeam(event.lastTouchedTeamId || this.possessionTeamId, this.teamIds);
          this.#beginInbound(awarded, "out_of_bounds", event.boundary);
          accepted = true;
        }
        break;
      case "FOUL":
        if (this.phase === FULL_COURT_PHASES.LIVE) {
          this.#beginInbound(event.offendedTeamId || this.possessionTeamId, "foul");
          accepted = true;
        }
        break;
      case "MISS":
      case "BLOCK":
      case "SHOT_ATTEMPT":
        accepted = this.phase === FULL_COURT_PHASES.LIVE;
        break;
      default:
        break;
    }
    return this.#response(accepted, accepted ? null : "event_rejected");
  }

  #basket(event) {
    if (this.phase !== FULL_COURT_PHASES.LIVE || event.teamId !== this.possessionTeamId) return false;
    const points = Number.isFinite(event.points)
      ? Math.max(0, Math.floor(event.points))
      : event.isThree ? 3 : 2;
    this.scores[event.teamId] = (this.scores[event.teamId] || 0) + points;
    const assist = this.lastPass
      && this.lastPass.toPlayerId === event.playerId
      && this.lastPass.possessionNumber === this.possessionNumber
      && this.lastPass.gameTime - this.gameClock <= 5
      ? this.lastPass.fromPlayerId
      : null;
    this.#emit("SCORE_CONFIRMED", {
      teamId: event.teamId,
      playerId: event.playerId,
      points,
      assistPlayerId: assist,
      scores: copyScores(this.scores),
    });
    const winner = this.#scoreWinner();
    if (winner || this.overtime) {
      this.#finish(winner || event.teamId, this.overtime ? "overtime_score" : "target_score");
    } else {
      this.#beginInbound(otherTeam(event.teamId, this.teamIds), "made_basket");
    }
    return true;
  }

  #rebound(event) {
    if (this.phase !== FULL_COURT_PHASES.LIVE || !event.teamId) return false;
    if (event.teamId === this.possessionTeamId) {
      this.shotClock = Math.min(14, this.shotClockDuration);
      this.#emit("RESET_SHOT_CLOCK", { seconds: this.shotClock, reason: "offensive_rebound" });
    } else {
      this.#livePossession(event.teamId, "defensive_rebound");
    }
    return true;
  }

  #scoreWinner() {
    const [a, b] = this.teamIds;
    const high = Math.max(this.scores[a] || 0, this.scores[b] || 0);
    if (high < this.targetScore) return null;
    if (high < this.scoreCap && (this.scores[a] || 0) === (this.scores[b] || 0)) return null;
    return (this.scores[a] || 0) > (this.scores[b] || 0) ? a : b;
  }

  #finishRegulation() {
    const [a, b] = this.teamIds;
    if ((this.scores[a] || 0) === (this.scores[b] || 0)) {
      this.overtime = true;
      this.shotClock = this.shotClockDuration;
      this.#emit("ANNOUNCE", { event: "overtime", text: "NEXT SCORE WINS", tone: "overtime" });
      return;
    }
    this.#finish((this.scores[a] || 0) > (this.scores[b] || 0) ? a : b, "game_clock");
  }

  #finish(winnerTeamId, reason) {
    this.result = {
      winnerTeamId,
      outcome: winnerTeamId === this.userTeamId ? "win" : "loss",
      reason,
      scores: copyScores(this.scores),
    };
    this.phase = FULL_COURT_PHASES.FINISHED;
    this.#emit("END_GAME", { result: { ...this.result } });
  }

  #livePossession(teamId, reason) {
    this.possessionTeamId = teamId;
    this.possessionNumber += 1;
    this.shotClock = this.shotClockDuration;
    this.lastPass = null;
    this.#emit("SET_POSSESSION", {
      teamId,
      reason,
      possessionNumber: this.possessionNumber,
      fullCourt: true,
      live: true,
    });
  }

  #beginInbound(teamId, reason, boundary = "baseline") {
    this.possessionTeamId = teamId;
    this.possessionNumber += 1;
    this.shotClock = this.shotClockDuration;
    this.inboundTimer = this.inboundDelay;
    this.lastPass = null;
    this.phase = FULL_COURT_PHASES.INBOUND;
    this.#emitInbound(reason, boundary);
  }

  #emitInbound(reason, boundary = "baseline") {
    this.#emit("SET_POSSESSION", {
      teamId: this.possessionTeamId,
      reason,
      boundary,
      position: restartSpotForTeam(this.id, this.possessionTeamId, boundary === "sideline" ? "sideline" : "inbound"),
      possessionNumber: this.possessionNumber,
      fullCourt: true,
    });
  }

  #emit(type, payload = {}) {
    this.commands.push({ type, ...payload });
  }

  #response(accepted, reason = null) {
    const commands = this.commands;
    this.commands = [];
    return { accepted: Boolean(accepted), reason, state: this.getState(), commands };
  }

  getState() {
    return {
      id: this.id,
      phase: this.phase,
      difficulty: this.difficulty,
      elapsed: this.elapsed,
      runNumber: this.runNumber,
      result: this.result ? { ...this.result } : null,
      scores: copyScores(this.scores || {}),
      possessionTeamId: this.possessionTeamId,
      possessionNumber: this.possessionNumber,
      shotClock: this.shotClock,
      gameClock: this.gameClock,
      overtime: this.overtime,
      targetScore: this.targetScore,
    };
  }

  getUIState() {
    return {
      ...this.getState(),
      title: "Nova Five",
      clockText: this.overtime ? "OT" : formatClock(this.gameClock),
      shotClockText: String(Math.ceil(this.shotClock)),
      statusText: this.phase === FULL_COURT_PHASES.INBOUND
        ? `${this.possessionTeamId} inbound`
        : this.overtime ? "NEXT SCORE WINS" : `${this.possessionTeamId} possession`,
    };
  }

  getRules() {
    return {
      id: this.id,
      playersPerTeam: 5,
      court: "full",
      baskets: 2,
      insidePoints: 2,
      outsidePoints: 3,
      shotClock: this.shotClockDuration,
      gameDuration: this.gameDuration,
      possessionAfterMake: "defense_inbound",
      overtime: "next_score",
    };
  }

  getAIContext() {
    return {
      difficulty: this.difficulty,
      offenseTeamId: this.possessionTeamId,
      shotClock: this.shotClock,
      gameClock: this.gameClock,
      possessionId: this.possessionNumber,
      phase: this.phase === FULL_COURT_PHASES.INBOUND ? "check" : this.phase,
      style: "team_full_court",
    };
  }
}

export function createFullCourtFiveOnFiveMode(config) {
  return new FullCourtFiveOnFiveMode(config);
}

