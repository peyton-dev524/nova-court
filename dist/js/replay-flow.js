/**
 * Deterministic lifecycle controller for scored-highlight replays.
 *
 * The controller owns no timers, DOM, input, camera, or physics state. Callers
 * advance it using simulation/render deltas and merge `frozen` into their own
 * pause policy. Gameplay is released only after the RESTORING phase reaches
 * 100% and the caller explicitly confirms that restoration was applied.
 */

export const REPLAY_FLOW_PHASES = Object.freeze({
  IDLE: "idle",
  QUEUED: "queued",
  PLAYING: "playing",
  RESTORING: "restoring",
});

export const REPLAY_FLOW_EVENTS = Object.freeze({
  FREEZE: "freeze",
  HIGHLIGHT_QUEUED: "highlightqueued",
  PLAYBACK_READY: "playbackready",
  PLAYBACK_STARTED: "playbackstarted",
  RESTORE_STARTED: "restorestarted",
  RESTORE_READY: "restoreready",
  RESTORE_COMPLETED: "restorecompleted",
  RESUME: "resume",
  RESET: "reset",
  QUEUE_REPLACED: "queuereplaced",
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export function replayRestoreEase(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function finiteDuration(value, fallback, minimum = 0) {
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
}

function normalizeHighlight(input, token, defaultQueueDelay) {
  const source = input && typeof input === "object" ? input : {};
  return Object.freeze({
    ...source,
    token,
    id: source.id ?? `highlight-${token}`,
    queueDelay: finiteDuration(source.queueDelay, defaultQueueDelay),
  });
}

export class ReplayFlowController {
  constructor(options = {}) {
    this.queueDelay = finiteDuration(options.queueDelay, 0.36);
    this.restoreDuration = finiteDuration(options.restoreDuration, 0.2, 0.001);
    this.queueLimit = Math.max(1, Math.trunc(options.queueLimit ?? 4));
    this.phase = REPLAY_FLOW_PHASES.IDLE;
    this.current = null;
    this.pending = [];
    this.phaseElapsed = 0;
    this.sequence = 0;
    this.playbackReady = false;
    this.restoreReady = false;
    this.restoreReason = null;
    this._events = [];
  }

  get frozen() {
    return this.phase !== REPLAY_FLOW_PHASES.IDLE;
  }

  get restorationProgress() {
    if (this.phase !== REPLAY_FLOW_PHASES.RESTORING) return 0;
    return clamp01(this.phaseElapsed / this.restoreDuration);
  }

  get restorationMix() {
    return replayRestoreEase(this.restorationProgress);
  }

  /**
   * Queue a scored highlight. If another replay is active, the new score waits
   * without releasing gameplay between highlights.
   */
  requestHighlight(highlight = {}) {
    const item = normalizeHighlight(highlight, ++this.sequence, this.queueDelay);
    if (!this.frozen) {
      this.current = item;
      this._enterQueued(true);
      return item.token;
    }

    if (this.pending.length >= this.queueLimit) {
      const replaced = this.pending[this.pending.length - 1];
      this.pending[this.pending.length - 1] = item;
      this._emit(REPLAY_FLOW_EVENTS.QUEUE_REPLACED, {
        token: item.token,
        id: item.id,
        replacedToken: replaced.token,
        replacedId: replaced.id,
      });
    } else {
      this.pending.push(item);
      this._emit(REPLAY_FLOW_EVENTS.HIGHLIGHT_QUEUED, {
        token: item.token,
        id: item.id,
        position: this.pending.length,
      });
    }
    return item.token;
  }

  /**
   * Deterministically advances lifecycle time.
   *
   * `restorationApplied` is an acknowledgement from the renderer/engine that
   * its authoritative transforms, camera, input mask, and presentation state
   * have actually reached the restoration target. It is ignored before 100%.
   */
  advance(dt, { restorationApplied = false } = {}) {
    const delta = finiteDuration(dt, 0);
    if (!this.frozen || delta === 0) {
      if (restorationApplied) this.confirmRestoration();
      return this.getSnapshot();
    }

    this.phaseElapsed += delta;
    if (this.phase === REPLAY_FLOW_PHASES.QUEUED
        && !this.playbackReady
        && this.phaseElapsed >= this.current.queueDelay) {
      this.playbackReady = true;
      this._emit(REPLAY_FLOW_EVENTS.PLAYBACK_READY, {
        token: this.current.token,
        id: this.current.id,
      });
    } else if (this.phase === REPLAY_FLOW_PHASES.RESTORING
        && !this.restoreReady
        && this.restorationProgress >= 1) {
      this.restoreReady = true;
      this._emit(REPLAY_FLOW_EVENTS.RESTORE_READY, {
        token: this.current?.token ?? null,
        id: this.current?.id ?? null,
        reason: this.restoreReason,
      });
    }

    if (restorationApplied) this.confirmRestoration();
    return this.getSnapshot();
  }

  /**
   * Starts playback only for the currently queued token. Supplying the token is
   * strongly recommended when start is scheduled asynchronously; stale timeout
   * callbacks then cannot accidentally start a later highlight.
   */
  startPlayback(token = this.current?.token) {
    if (this.phase !== REPLAY_FLOW_PHASES.QUEUED
        || !this.playbackReady
        || token !== this.current?.token) return false;
    this.phase = REPLAY_FLOW_PHASES.PLAYING;
    this.phaseElapsed = 0;
    this.playbackReady = false;
    this._emit(REPLAY_FLOW_EVENTS.PLAYBACK_STARTED, {
      token: this.current.token,
      id: this.current.id,
    });
    return true;
  }

  /**
   * Called by replay animation code after its final frame/pose has rendered.
   * This begins restoration; it never releases gameplay by itself.
   */
  completePlayback(token = this.current?.token) {
    if (this.phase !== REPLAY_FLOW_PHASES.PLAYING
        || token !== this.current?.token) return false;
    return this._beginRestoration("complete");
  }

  /**
   * Skipping still restores camera, transforms, and input state. A skip during
   * the pre-roll queue is handled identically to a skip during playback.
   */
  skip(reason = "skipped", token = this.current?.token) {
    if (!this.frozen || this.phase === REPLAY_FLOW_PHASES.RESTORING
        || token !== this.current?.token) return false;
    return this._beginRestoration(reason);
  }

  /**
   * Interruptions (mode overlays, lost focus, renderer recovery) preserve the
   * freeze and move through restoration. Pending highlights are dropped unless
   * explicitly retained.
   */
  interrupt(reason = "interrupted", { keepPending = false } = {}) {
    if (!this.frozen) return false;
    if (!keepPending) this.pending.length = 0;
    if (this.phase === REPLAY_FLOW_PHASES.RESTORING) {
      this.restoreReason = reason;
      return true;
    }
    return this._beginRestoration(reason);
  }

  /**
   * Acknowledges completed restoration. It is deliberately rejected before the
   * restore envelope reaches 100%, preventing mid-animation resumption.
   */
  confirmRestoration(token = this.current?.token) {
    if (this.phase !== REPLAY_FLOW_PHASES.RESTORING
        || !this.restoreReady
        || token !== this.current?.token) return false;

    const completed = this.current;
    this._emit(REPLAY_FLOW_EVENTS.RESTORE_COMPLETED, {
      token: completed?.token ?? null,
      id: completed?.id ?? null,
      reason: this.restoreReason,
    });
    if (this.pending.length > 0) {
      this.current = this.pending.shift();
      this._enterQueued(false);
    } else {
      this.phase = REPLAY_FLOW_PHASES.IDLE;
      this.current = null;
      this.phaseElapsed = 0;
      this.playbackReady = false;
      this.restoreReady = false;
      this.restoreReason = null;
      this._emit(REPLAY_FLOW_EVENTS.RESUME, {
        token: completed?.token ?? null,
        id: completed?.id ?? null,
      });
    }
    return true;
  }

  /**
   * Hard reset for a mode/world reset. No restoration acknowledgement is
   * required because the caller is replacing the authoritative game state.
   * The reset event tells integration code to release only its replay-owned
   * pause/input lock, leaving user pause state untouched.
   */
  reset(reason = "mode-reset") {
    const wasFrozen = this.frozen;
    const dropped = (this.current ? 1 : 0) + this.pending.length;
    this.phase = REPLAY_FLOW_PHASES.IDLE;
    this.current = null;
    this.pending.length = 0;
    this.phaseElapsed = 0;
    this.playbackReady = false;
    this.restoreReady = false;
    this.restoreReason = null;
    this._emit(REPLAY_FLOW_EVENTS.RESET, { reason, dropped, wasFrozen });
    return wasFrozen;
  }

  drainEvents() {
    const result = this._events;
    this._events = [];
    return result;
  }

  getSnapshot() {
    return Object.freeze({
      phase: this.phase,
      frozen: this.frozen,
      token: this.current?.token ?? null,
      id: this.current?.id ?? null,
      phaseElapsed: this.phaseElapsed,
      playbackReady: this.playbackReady,
      restoreReady: this.restoreReady,
      restorationProgress: this.restorationProgress,
      restorationMix: this.restorationMix,
      restoreReason: this.restoreReason,
      pendingCount: this.pending.length,
    });
  }

  _enterQueued(initialFreeze) {
    this.phase = REPLAY_FLOW_PHASES.QUEUED;
    this.phaseElapsed = 0;
    this.playbackReady = this.current.queueDelay === 0;
    this.restoreReady = false;
    this.restoreReason = null;
    if (initialFreeze) {
      this._emit(REPLAY_FLOW_EVENTS.FREEZE, {
        token: this.current.token,
        id: this.current.id,
      });
    }
    this._emit(REPLAY_FLOW_EVENTS.HIGHLIGHT_QUEUED, {
      token: this.current.token,
      id: this.current.id,
      position: 0,
    });
    if (this.playbackReady) {
      this._emit(REPLAY_FLOW_EVENTS.PLAYBACK_READY, {
        token: this.current.token,
        id: this.current.id,
      });
    }
  }

  _beginRestoration(reason) {
    this.phase = REPLAY_FLOW_PHASES.RESTORING;
    this.phaseElapsed = 0;
    this.playbackReady = false;
    this.restoreReady = false;
    this.restoreReason = String(reason || "restore");
    this._emit(REPLAY_FLOW_EVENTS.RESTORE_STARTED, {
      token: this.current?.token ?? null,
      id: this.current?.id ?? null,
      reason: this.restoreReason,
      duration: this.restoreDuration,
    });
    return true;
  }

  _emit(type, detail = {}) {
    this._events.push(Object.freeze({ type, ...detail }));
  }
}

export function createReplayFlow(options) {
  return new ReplayFlowController(options);
}

export default createReplayFlow;
