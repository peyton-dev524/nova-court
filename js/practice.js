import { MODE_PHASES } from "./modes.js";

export const PRACTICE_MODE_ID = "open_gym";

const normalizeEvent = (eventOrType, payload = {}) => (
  typeof eventOrType === "string"
    ? { ...payload, type: eventOrType.toUpperCase() }
    : { ...(eventOrType || {}), type: String(eventOrType?.type || "").toUpperCase() }
);

export class PracticeMode {
  constructor(config = {}) {
    this.config = {
      returnDelay: Number(config.returnDelay) || 520,
      shotTimeout: Number(config.shotTimeout) || 4.5,
    };
    this.phase = MODE_PHASES.READY;
    this._commands = [];
    this._pausedFrom = null;
    this.restart();
  }

  _response(accepted = true) {
    return { accepted, state: this.getState(), commands: this.consumeCommands() };
  }

  _queue(type, detail = {}) {
    this._commands.push({ type, ...detail });
  }

  _resolveShot(made) {
    if (!this.pendingShot) this.attempts += 1;
    this.pendingShot = null;
    if (made) {
      this.makes += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
    } else {
      this.streak = 0;
    }
    this._queue("PRACTICE_SHOT_RESOLVED", {
      made,
      makes: this.makes,
      attempts: this.attempts,
      streak: this.streak,
      bestStreak: this.bestStreak,
    });
    this._queue("RETURN_BALL", { delay: this.config.returnDelay });
  }

  start() {
    return this.restart();
  }

  restart() {
    this.phase = MODE_PHASES.LIVE;
    this.elapsed = 0;
    this.makes = 0;
    this.attempts = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.pendingShot = null;
    this._commands.length = 0;
    this._queue("ANNOUNCE", { text: "OPEN GYM · FIND YOUR RHYTHM" });
    this._queue("SET_BALL_LIVE");
    this._queue("RETURN_BALL", { delay: 0 });
    return this._response();
  }

  rematch() {
    return this.restart();
  }

  pause() {
    if (this.phase === MODE_PHASES.PAUSED) return this._response(false);
    this._pausedFrom = this.phase;
    this.phase = MODE_PHASES.PAUSED;
    return this._response();
  }

  resume() {
    if (this.phase !== MODE_PHASES.PAUSED) return this._response(false);
    this.phase = this._pausedFrom || MODE_PHASES.LIVE;
    this._pausedFrom = null;
    return this._response();
  }

  update(dt = 0) {
    if (this.phase !== MODE_PHASES.LIVE) return this._response();
    const delta = Math.max(0, Number(dt) || 0);
    this.elapsed += delta;
    if (this.pendingShot) {
      this.pendingShot.age += delta;
      if (this.pendingShot.age >= this.config.shotTimeout) this._resolveShot(false);
    }
    return this._response();
  }

  handleEvent(eventOrType, payload = {}) {
    const event = normalizeEvent(eventOrType, payload);
    if (this.phase !== MODE_PHASES.LIVE) return this._response(false);
    if (event.type === "SHOT_ATTEMPT") {
      if (!this.pendingShot) {
        this.attempts += 1;
        this.pendingShot = { age: 0, shotId: event.shotId || null };
      }
      return this._response();
    }
    if (event.type === "BASKET") {
      this._resolveShot(true);
      return this._response();
    }
    if (event.type === "MISS" || event.type === "BLOCK") {
      if (this.pendingShot) this._resolveShot(false);
      return this._response();
    }
    if (event.type === "REBOUND") {
      if (this.pendingShot) this._resolveShot(false);
      else this._queue("RETURN_BALL", { delay: 180 });
      return this._response();
    }
    return this._response(false);
  }

  consumeCommands() {
    return this._commands.splice(0);
  }

  getState() {
    return {
      id: PRACTICE_MODE_ID,
      phase: this.phase,
      elapsed: this.elapsed,
      makes: this.makes,
      attempts: this.attempts,
      streak: this.streak,
      bestStreak: this.bestStreak,
      pendingShot: !!this.pendingShot,
    };
  }

  getUIState() {
    return {
      title: "Open Gym",
      clockText: "FREEPLAY",
      statusText: `STREAK ${this.streak} · BEST ${this.bestStreak}`,
    };
  }

  getRules() {
    return {
      id: PRACTICE_MODE_ID,
      name: "Open Gym",
      description: "Unlimited solo reps with automatic ball return and streak tracking.",
      timed: false,
      outOfBounds: false,
      madeShotReplays: false,
    };
  }

  getAIContext() {
    return { phase: this.phase, offenseTeamId: "home", shotClock: null, gameClock: null };
  }
}

export function createPracticeMode(config = {}) {
  return new PracticeMode(config);
}

export default createPracticeMode;
