

/**
 * Deterministic broadcast, replay, venue, and audio presentation contracts.
 *
 * This module deliberately owns no DOM, Three.js, Web Audio, wall-clock timer,
 * persistence, or gameplay state. Runtime adapters consume its snapshots and
 * commands, keeping presentation effects unable to change competitive results.
 */

const clamp = (value, minimum, maximum) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : minimum;
};
const clamp01 = (value) => clamp(value, 0, 1);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function presentationStateFingerprint(value) {
  return hashString(canonical(value)).toString(16).padStart(8, "0");
}

// ---------------------------------------------------------------------------
// Pause menu contract (requirement 80)

export const PAUSE_TABS = deepFreeze([
  {
    id: "match",
    label: "Match",
    actions: ["resume", "challenges", "match-rules"],
  },
  {
    id: "replay",
    label: "Replay",
    actions: ["instant-replay"],
  },
  {
    id: "statistics",
    label: "Statistics",
    actions: ["statistics"],
  },
  {
    id: "controls",
    label: "Controls",
    actions: ["controls"],
  },
  {
    id: "camera",
    label: "Camera",
    actions: ["camera-settings"],
  },
  {
    id: "audio-accessibility",
    label: "Audio & Accessibility",
    actions: ["audio-settings", "accessibility"],
  },
  {
    id: "system",
    label: "System",
    actions: ["restart", "quit"],
  },
]);

const PAUSE_ACTIONS = deepFreeze({
  resume: { label: "Resume", intent: "resume", closesPause: true },
  "instant-replay": { label: "Instant Replay", intent: "open-replay" },
  statistics: { label: "Statistics", intent: "open-statistics" },
  controls: { label: "Controls", intent: "open-controls" },
  "camera-settings": { label: "Camera Settings", intent: "open-camera-settings" },
  "audio-settings": { label: "Audio Settings", intent: "open-audio-settings" },
  accessibility: { label: "Accessibility", intent: "open-accessibility" },
  restart: { label: "Restart", intent: "restart", confirmation: "restart-match" },
  quit: { label: "Quit", intent: "quit", confirmation: "quit-match" },
  challenges: { label: "Current Challenges", intent: "show-challenges" },
  "match-rules": { label: "Match Rules", intent: "show-match-rules" },
});

export function createPauseMenuContract({
  replayFrames = 0,
  restartAllowed = true,
  challenges = [],
  rules = {},
} = {}) {
  return deepFreeze(PAUSE_TABS.map((tab) => ({
    ...tab,
    actions: tab.actions.map((id) => {
      const base = { id, ...PAUSE_ACTIONS[id], enabled: true, reason: null };
      if (id === "instant-replay" && replayFrames < 2) {
        return { ...base, enabled: false, reason: "Replay becomes available after action is recorded." };
      }
      if (id === "restart" && !restartAllowed) {
        return { ...base, enabled: false, reason: "Restart is disabled by this match format." };
      }
      if (id === "challenges") return { ...base, payload: clone(challenges) };
      if (id === "match-rules") return { ...base, payload: clone(rules) };
      return base;
    }),
  })));
}

// ---------------------------------------------------------------------------
// Instant replay, markers, save/export metadata (requirements 81 and 83)

export const REPLAY_DIRECTOR_PHASES = Object.freeze({
  IDLE: "idle",
  READY: "ready",
  PLAYING: "playing",
  PAUSED: "paused",
  RESTORING: "restoring",
});

export const REPLAY_CAMERAS = Object.freeze(["broadcast", "sideline", "rim", "player", "free"]);
export const REPLAY_RATES = Object.freeze([0.25, 0.5, 1]);
export const AUTO_HIGHLIGHT_TYPES = Object.freeze(["dunk", "block", "game-winner", "ankle-breaker"]);

const HIGHLIGHT_TYPE_ALIASES = Object.freeze({
  "game-winner": "game-winner",
  "winning-shot": "game-winner",
  "highest-value-dunk": "dunk",
  "best-dunk": "dunk",
  "best-block": "block",
  "best-assist": "assist",
  "longest-shot": "long-shot",
  "biggest-scoring-run": "scoring-run",
  "best-defensive-possession": "defensive-possession",
});

const normalizeHighlightType = (value) => {
  const type = String(value || "play").trim().toLowerCase().replaceAll("_", "-");
  return HIGHLIGHT_TYPE_ALIASES[type] || type;
};

export function createReplayMarker(event = {}, index = 0) {
  const type = normalizeHighlightType(event.type);
  const timestamp = Math.max(0, finite(event.timestamp, finite(event.time, 0)));
  return deepFreeze({
    id: String(event.id || `marker-${index + 1}-${Math.round(timestamp * 1000)}`),
    type,
    timestamp,
    frameIndex: Math.max(0, Math.trunc(finite(event.frameIndex, 0))),
    automatic: event.automatic ?? AUTO_HIGHLIGHT_TYPES.includes(type),
    playerId: event.playerId == null ? null : String(event.playerId),
    teamId: event.teamId == null ? null : String(event.teamId),
    value: Math.max(0, finite(event.value, 0)),
    metadata: clone(event.metadata || {}),
  });
}

function normalizeReplayFrames(frames, frameRate) {
  if (!Array.isArray(frames) || frames.length === 0) throw new TypeError("Replay requires at least one frame.");
  let previous = -Infinity;
  return frames.map((frame, index) => {
    const fallbackTime = index / frameRate;
    const requestedTime = finite(frame?.t, fallbackTime);
    const time = index && requestedTime <= previous ? previous + 1 / frameRate : Math.max(0, requestedTime);
    previous = time;
    return deepFreeze({ ...clone(frame || {}), t: time });
  });
}

function closestFrameIndex(frames, cursor) {
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (frames[middle].t <= cursor) low = middle;
    else high = middle - 1;
  }
  return low;
}

export class ReplayDirector {
  constructor({ frameRate = 30 } = {}) {
    this.frameRate = clamp(frameRate, 1, 240);
    this.phase = REPLAY_DIRECTOR_PHASES.IDLE;
    this.sequence = 0;
    this.session = null;
    this.cursor = 0;
    this.rate = 1;
    this.camera = "broadcast";
    this.freeCamera = { position: [0, 3, 6], target: [0, 1.5, 0], yaw: 0, pitch: 0 };
    this.zoom = 1;
    this.hudVisible = true;
    this.restoreRequest = null;
  }

  get ownsSimulationLock() {
    return this.phase !== REPLAY_DIRECTOR_PHASES.IDLE;
  }

  open({ id, frames, markers = [], liveState, match = {} } = {}) {
    if (this.ownsSimulationLock) return false;
    if (!liveState || typeof liveState !== "object") throw new TypeError("Replay requires an authoritative liveState snapshot.");
    const normalizedFrames = normalizeReplayFrames(frames, this.frameRate);
    const token = ++this.sequence;
    const restoreState = deepFreeze(clone(liveState));
    this.session = deepFreeze({
      token,
      id: String(id || `replay-${token}`),
      frames: normalizedFrames,
      markers: markers.map(createReplayMarker).sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)),
      duration: normalizedFrames.at(-1).t,
      match: clone(match),
      restoreState,
      restoreFingerprint: presentationStateFingerprint(restoreState),
    });
    this.phase = REPLAY_DIRECTOR_PHASES.READY;
    this.cursor = 0;
    this.rate = 1;
    this.camera = "broadcast";
    this.zoom = 1;
    this.hudVisible = true;
    this.restoreRequest = null;
    return token;
  }

  play() {
    if (![REPLAY_DIRECTOR_PHASES.READY, REPLAY_DIRECTOR_PHASES.PAUSED].includes(this.phase)) return false;
    this.phase = REPLAY_DIRECTOR_PHASES.PLAYING;
    return true;
  }

  pause() {
    if (this.phase !== REPLAY_DIRECTOR_PHASES.PLAYING) return false;
    this.phase = REPLAY_DIRECTOR_PHASES.PAUSED;
    return true;
  }

  togglePlayback() {
    return this.phase === REPLAY_DIRECTOR_PHASES.PLAYING ? this.pause() : this.play();
  }

  setRate(rate) {
    const next = Number(rate);
    if (!REPLAY_RATES.includes(next)) return false;
    this.rate = next;
    return true;
  }

  selectCamera(camera) {
    if (!REPLAY_CAMERAS.includes(camera) || !this.ownsSimulationLock || this.phase === REPLAY_DIRECTOR_PHASES.RESTORING) return false;
    this.camera = camera;
    return true;
  }

  setFreeCamera({ position, target, yaw, pitch } = {}) {
    if (this.camera !== "free" || !this.session) return false;
    const vector = (input, fallback) => Array.isArray(input) && input.length >= 3
      ? input.slice(0, 3).map((value, index) => finite(value, fallback[index]))
      : [...fallback];
    this.freeCamera = {
      position: vector(position, this.freeCamera.position),
      target: vector(target, this.freeCamera.target),
      yaw: finite(yaw, this.freeCamera.yaw),
      pitch: clamp(finite(pitch, this.freeCamera.pitch), -Math.PI * 0.49, Math.PI * 0.49),
    };
    return true;
  }

  setZoom(zoom) {
    if (!this.session || this.phase === REPLAY_DIRECTOR_PHASES.RESTORING) return false;
    this.zoom = clamp(zoom, 0.5, 3);
    return this.zoom;
  }

  setHudVisible(visible) {
    if (!this.session || this.phase === REPLAY_DIRECTOR_PHASES.RESTORING) return false;
    this.hudVisible = Boolean(visible);
    return true;
  }

  restart() {
    if (!this.session || this.phase === REPLAY_DIRECTOR_PHASES.RESTORING) return false;
    this.cursor = 0;
    this.phase = REPLAY_DIRECTOR_PHASES.PAUSED;
    return true;
  }

  seek(seconds) {
    if (!this.session || this.phase === REPLAY_DIRECTOR_PHASES.RESTORING) return false;
    this.cursor = clamp(seconds, 0, this.session.duration);
    return this.cursor;
  }

  stepFrame(direction = 1) {
    if (!this.session || this.phase === REPLAY_DIRECTOR_PHASES.RESTORING) return false;
    if (this.phase === REPLAY_DIRECTOR_PHASES.PLAYING) this.pause();
    const index = clamp(closestFrameIndex(this.session.frames, this.cursor) + Math.sign(finite(direction, 1)), 0, this.session.frames.length - 1);
    this.cursor = this.session.frames[index].t;
    this.phase = REPLAY_DIRECTOR_PHASES.PAUSED;
    return index;
  }

  advance(dt) {
    if (this.phase !== REPLAY_DIRECTOR_PHASES.PLAYING || !this.session) return this.getSnapshot();
    this.cursor = clamp(this.cursor + Math.max(0, finite(dt, 0)) * this.rate, 0, this.session.duration);
    if (this.cursor >= this.session.duration) this.phase = REPLAY_DIRECTOR_PHASES.PAUSED;
    return this.getSnapshot();
  }

  requestRestoration(reason = "close") {
    if (!this.session || this.phase === REPLAY_DIRECTOR_PHASES.RESTORING) return false;
    this.phase = REPLAY_DIRECTOR_PHASES.RESTORING;
    this.restoreRequest = deepFreeze({
      token: this.session.token,
      reason: String(reason || "close"),
      state: clone(this.session.restoreState),
      fingerprint: this.session.restoreFingerprint,
    });
    return this.restoreRequest;
  }

  confirmRestoration(token, appliedFingerprint) {
    if (this.phase !== REPLAY_DIRECTOR_PHASES.RESTORING
      || token !== this.restoreRequest?.token
      || appliedFingerprint !== this.restoreRequest?.fingerprint) return false;
    this.phase = REPLAY_DIRECTOR_PHASES.IDLE;
    this.session = null;
    this.restoreRequest = null;
    this.cursor = 0;
    return true;
  }

  resetForWorldReplacement() {
    const wasActive = this.ownsSimulationLock;
    this.phase = REPLAY_DIRECTOR_PHASES.IDLE;
    this.session = null;
    this.restoreRequest = null;
    this.cursor = 0;
    return wasActive;
  }

  saveHighlight(markerId, overrides = {}) {
    if (!this.session) return null;
    const marker = this.session.markers.find((candidate) => candidate.id === markerId);
    if (!marker) return null;
    return createHighlightExportMetadata({
      ...this.session.match,
      ...overrides,
      replayId: this.session.id,
      marker,
      frameRate: this.frameRate,
    });
  }

  getSnapshot() {
    const frames = this.session?.frames || [];
    const frameIndex = frames.length ? closestFrameIndex(frames, this.cursor) : -1;
    return deepFreeze({
      phase: this.phase,
      ownsSimulationLock: this.ownsSimulationLock,
      token: this.session?.token ?? null,
      replayId: this.session?.id ?? null,
      cursor: this.cursor,
      duration: this.session?.duration ?? 0,
      frameIndex,
      frame: frameIndex >= 0 ? clone(frames[frameIndex]) : null,
      rate: this.rate,
      camera: this.camera,
      freeCamera: clone(this.freeCamera),
      zoom: this.zoom,
      hudVisible: this.hudVisible,
      markers: clone(this.session?.markers || []),
      restoreRequest: clone(this.restoreRequest),
    });
  }
}

export function createReplayDirector(options) {
  return new ReplayDirector(options);
}

export const HIGHLIGHT_PRIORITY = Object.freeze({
  "game-winner": 1000,
  dunk: 800,
  block: 700,
  assist: 600,
  "long-shot": 500,
  "scoring-run": 400,
  "defensive-possession": 300,
  "ankle-breaker": 650,
});

function normalizeHighlight(event, index) {
  const marker = createReplayMarker(event, index);
  const base = HIGHLIGHT_PRIORITY[marker.type] || 100;
  return deepFreeze({
    ...marker,
    duration: clamp(event.duration, 1, 12),
    priority: base + clamp(event.value, 0, 99),
  });
}

export function prioritizeHighlights(events = [], { maxClips = 7, maxDuration = 45 } = {}) {
  const bestByType = new Map();
  events.map(normalizeHighlight).forEach((highlight) => {
    const existing = bestByType.get(highlight.type);
    if (!existing
      || highlight.priority > existing.priority
      || (highlight.priority === existing.priority && highlight.timestamp < existing.timestamp)
      || (highlight.priority === existing.priority && highlight.timestamp === existing.timestamp && highlight.id < existing.id)) {
      bestByType.set(highlight.type, highlight);
    }
  });
  const ranked = [...bestByType.values()].sort((a, b) =>
    b.priority - a.priority || a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  const selected = [];
  let duration = 0;
  for (const highlight of ranked) {
    if (selected.length >= Math.max(0, Math.trunc(maxClips))) break;
    if (selected.length && duration + highlight.duration > Math.max(1, finite(maxDuration, 45))) continue;
    selected.push(highlight);
    duration += highlight.duration;
  }
  return deepFreeze({
    clips: selected,
    duration,
    controls: { skippable: true, replayable: true, savable: true },
  });
}

export function createHighlightExportMetadata({
  matchId,
  replayId,
  marker,
  venueId,
  mode,
  finalScore,
  participants = [],
  frameRate = 30,
  createdAt = null,
  streamSafe = true,
} = {}) {
  if (!marker) throw new TypeError("Highlight export metadata requires a marker.");
  const normalized = createReplayMarker(marker);
  return deepFreeze({
    schema: "nova-court-highlight/v1",
    matchId: String(matchId || "unknown-match"),
    replayId: String(replayId || "unknown-replay"),
    highlightId: normalized.id,
    type: normalized.type,
    timestamp: normalized.timestamp,
    frameIndex: normalized.frameIndex,
    frameRate: clamp(frameRate, 1, 240),
    venueId: String(venueId || "montgomery"),
    mode: String(mode || "park-duel"),
    finalScore: clone(finalScore || null),
    participants: participants.map((participant) => ({
      id: String(participant.id || "unknown"),
      displayName: String(participant.displayName || participant.name || "Player"),
      teamId: participant.teamId == null ? null : String(participant.teamId),
    })),
    createdAt: createdAt == null ? null : String(createdAt),
    streamSafe: Boolean(streamSafe),
  });
}

// ---------------------------------------------------------------------------
// Competitive Photo Mode contract (requirement 82)

export const PHOTO_FILTERS = Object.freeze(["none", "nova-night", "court-chrome", "warm-film", "mono-pulse"]);
export const PHOTO_FRAMES = Object.freeze(["none", "ncn-live", "nova-court", "final-score"]);
export const PHOTO_POSES = Object.freeze(["authentic", "celebrate", "respect", "victory-point", "arms-folded"]);

export function photoModePolicy({ competitive = false, matchPhase = "live" } = {}) {
  const postgame = matchPhase === "postgame";
  const allowed = !competitive || postgame;
  return deepFreeze({
    allowed,
    reason: allowed ? null : "Photo Mode is available after competitive matches, never during live play.",
    posesAllowed: postgame,
  });
}

export function normalizePhotoModeSettings(settings = {}, context = {}) {
  const policy = photoModePolicy(context);
  if (!policy.allowed) return deepFreeze({ policy, settings: null });
  const filter = PHOTO_FILTERS.includes(settings.filter) ? settings.filter : "none";
  const frame = PHOTO_FRAMES.includes(settings.frame) ? settings.frame : "none";
  const requestedPose = PHOTO_POSES.includes(settings.pose) ? settings.pose : "authentic";
  return deepFreeze({
    policy,
    settings: {
      camera: "free",
      fieldOfView: clamp(finite(settings.fieldOfView, 50), 20, 90),
      depthOfField: clamp01(finite(settings.depthOfField, 0.35)),
      focusDistance: clamp(finite(settings.focusDistance, 5), 0.25, 80),
      exposure: clamp(finite(settings.exposure, 0), -2, 2),
      contrast: clamp(finite(settings.contrast, 0), -1, 1),
      filter,
      playerFocus: settings.playerFocus == null ? null : String(settings.playerFocus),
      hudVisible: settings.hudVisible !== false,
      pose: policy.posesAllowed ? requestedPose : "authentic",
      frame,
    },
  });
}

// ---------------------------------------------------------------------------
// NCN broadcast roles, scouting, and anti-spam (requirements 74 and 100)

export const NCN_ROLES = deepFreeze({
  playByPlay: { id: "mara-voss", name: "Mara Voss", role: "Play-by-play announcer" },
  color: { id: "jax-mercer", name: "Jax Mercer", role: "Color commentator" },
  arena: { id: "sloane-hart", name: "Sloane Hart", role: "Arena announcer" },
  sideline: { id: "nia-cole", name: "Nia Cole", role: "Sideline host" },
  analyst: { id: "dorian-pike", name: "Dorian Pike", role: "Postgame analyst" },
});

export function createScoutingReport(opponent = {}) {
  const record = opponent.recentRecord || {};
  return deepFreeze({
    opponentId: String(opponent.id || "unknown-opponent"),
    displayName: String(opponent.displayName || opponent.name || "Unknown Rival"),
    preferredScoringArea: String(opponent.preferredScoringArea || "inside the arc"),
    dominantHand: String(opponent.dominantHand || "right"),
    strongestAttribute: String(opponent.strongestAttribute || "shot creation"),
    defensiveWeakness: String(opponent.defensiveWeakness || "late weak-side recovery"),
    recentRecord: typeof record === "string"
      ? record.slice(0, 12)
      : `${Math.max(0, Math.trunc(finite(record.wins, 0)))}-${Math.max(0, Math.trunc(finite(record.losses, 0)))}`,
    archetype: String(opponent.archetype || "two-way creator"),
    favoriteMove: String(opponent.favoriteMove || "hesitation drive"),
    hiddenRatingsExposed: false,
  });
}

const NCN_EVENT_ROLE = Object.freeze({
  scouting: "sideline",
  "home-intro": "arena",
  "rival-intro": "arena",
  "venue-open": "playByPlay",
  "scoring-run": "color",
  "game-point": "playByPlay",
  postgame: "analyst",
});

const NCN_COOLDOWNS = Object.freeze({
  scouting: Infinity,
  "home-intro": Infinity,
  "rival-intro": Infinity,
  "venue-open": Infinity,
  "scoring-run": 8,
  "game-point": 12,
  postgame: Infinity,
});

function ncnText(type, payload, seed) {
  const player = String(payload.playerName || "the home player");
  const rival = String(payload.rivalName || payload.opponentName || "the rival");
  const venue = String(payload.venueName || "Montgomery Park");
  const score = payload.score ? `${payload.score.home}-${payload.score.away}` : "level";
  const report = payload.report ? createScoutingReport(payload.report) : null;
  const templates = {
    scouting: [
      `${report?.displayName || rival} favors ${report?.preferredScoringArea || "the lane"} and the ${report?.dominantHand || "right"} hand. Show help early, then test ${report?.defensiveWeakness || "the recovery"}.`,
      `Scout note: ${report?.archetype || "creator"}, strongest as a ${report?.strongestAttribute || "shot maker"}. Watch the ${report?.favoriteMove || "first move"}; recent form is ${report?.recentRecord || "0-0"}.`,
    ],
    "home-intro": [`${venue}, welcome ${player} to the light!`],
    "rival-intro": [`Across the line, ${rival}. The rivalry gets another chapter.`],
    "venue-open": [`NCN is live from ${venue}. The court is clear and Park Duel is next.`],
    "scoring-run": [
      `${player} has found the pattern. That run is forcing a new answer.`,
      `Momentum is visible now; ${rival} has to break the rhythm.`,
    ],
    "game-point": [
      `Game point at ${score}. Every step matters now.`,
      `${player} can close it here. Game point under the lights.`,
    ],
    postgame: [
      `${player} controlled the decisive possessions. Final: ${score}.`,
      `The difference was response under pressure. ${player} leaves ${venue} with the result.`,
    ],
  };
  const lines = templates[type] || [];
  return lines.length ? lines[hashString(`${type}:${seed}`) % lines.length] : null;
}

export class NcnBroadcastDirector {
  constructor({ maxNormalCallsPerWindow = 3, windowSeconds = 10 } = {}) {
    this.elapsed = 0;
    this.sequence = 0;
    this.lastByType = new Map();
    this.recentCalls = [];
    this.maxNormalCallsPerWindow = Math.max(1, Math.trunc(maxNormalCallsPerWindow));
    this.windowSeconds = Math.max(1, finite(windowSeconds, 10));
  }

  advance(dt) {
    this.elapsed += Math.max(0, finite(dt, 0));
    return this.elapsed;
  }

  reset() {
    this.elapsed = 0;
    this.sequence = 0;
    this.lastByType.clear();
    this.recentCalls.length = 0;
  }

  announce(eventType, payload = {}) {
    const type = String(eventType || "").toLowerCase();
    const roleId = NCN_EVENT_ROLE[type];
    if (!roleId) return null;
    const now = Math.max(0, finite(payload.now, this.elapsed));
    const priority = ["game-point", "postgame"].includes(type) ? "high" : "normal";
    const fingerprint = presentationStateFingerprint({
      type,
      playerName: payload.playerName,
      rivalName: payload.rivalName,
      score: payload.score,
    });
    const previous = this.lastByType.get(type);
    const cooldown = NCN_COOLDOWNS[type] ?? 4;
    if (previous && (previous.fingerprint === fingerprint || now - previous.at < cooldown)) return null;
    this.recentCalls = this.recentCalls.filter((at) => now - at < this.windowSeconds);
    if (priority === "normal" && this.recentCalls.length >= this.maxNormalCallsPerWindow) return null;
    const text = ncnText(type, payload, payload.seed ?? `${this.sequence}:${fingerprint}`);
    if (!text) return null;
    this.sequence += 1;
    this.lastByType.set(type, { at: now, fingerprint });
    this.recentCalls.push(now);
    const role = NCN_ROLES[roleId];
    return deepFreeze({
      id: `ncn-${this.sequence}`,
      type,
      role,
      text,
      caption: `${role.name.toUpperCase()} Ãƒâ€šÃ‚Â· ${text}`,
      priority,
      interrupt: type === "game-point" || type === "postgame",
      duckMusic: priority === "high" ? 0.34 : 0.52,
    });
  }
}

export function createNcnBroadcastDirector(options) {
  return new NcnBroadcastDirector(options);
}

// ---------------------------------------------------------------------------
// Reactive, stream-safe soundtrack (requirement 75)

export const SOUNDTRACK_STATES = Object.freeze({
  MENU: "menu",
  INTRO: "intro",
  GAMEPLAY: "gameplay",
  GAME_POINT: "game-point",
  VICTORY: "victory",
  POSTGAME: "postgame",
  PAUSED: "paused",
});

const SOUNDTRACK_MIX = deepFreeze({
  menu: { arrangement: "full", level: 1, intensity: 0.55 },
  intro: { arrangement: "instrumental", level: 0.76, intensity: 0.68 },
  gameplay: { arrangement: "gameplay-bed", level: 0.28, intensity: 0.44 },
  "game-point": { arrangement: "game-point", level: 0.56, intensity: 1 },
  victory: { arrangement: "victory", level: 0.9, intensity: 0.88 },
  postgame: { arrangement: "postgame", level: 0.64, intensity: 0.52 },
  paused: { arrangement: "gameplay-bed", level: 0.16, intensity: 0.2 },
});

export const VENUE_PLAYLISTS = deepFreeze({
  montgomery: [
    { id: "midnight-chain", title: "Midnight Chain", streamSafe: true },
    { id: "fence-light", title: "Fence Light", streamSafe: true },
  ],
  arena840: [
    { id: "brick-echo", title: "Brick Echo", streamSafe: true },
    { id: "840-afterglow", title: "840 Afterglow", streamSafe: false },
  ],
});

export class SoundtrackDirector {
  constructor({ venueId = "montgomery", volume = 0.55, streamSafe = false } = {}) {
    this.venueId = VENUE_PLAYLISTS[venueId] ? venueId : "montgomery";
    this.volume = clamp01(volume);
    this.streamSafe = Boolean(streamSafe);
    this.state = SOUNDTRACK_STATES.MENU;
    this.ducking = new Map();
    this.gain = 0;
    this.trackIndex = 0;
  }

  setState(state) {
    if (!SOUNDTRACK_MIX[state]) return false;
    this.state = state;
    return true;
  }

  setVenue(venueId) {
    if (!VENUE_PLAYLISTS[venueId]) return false;
    this.venueId = venueId;
    this.trackIndex = 0;
    return true;
  }

  setVolume(volume) {
    this.volume = clamp01(volume);
    return this.volume;
  }

  setStreamSafe(enabled) {
    this.streamSafe = Boolean(enabled);
    this.trackIndex = 0;
    return this.streamSafe;
  }

  setDuck(reason, active, multiplier = 0.42) {
    const id = String(reason || "presentation");
    if (active) this.ducking.set(id, clamp(multiplier, 0.05, 1));
    else this.ducking.delete(id);
    return this.targetGain;
  }

  get availableTracks() {
    const playlist = VENUE_PLAYLISTS[this.venueId];
    return this.streamSafe ? playlist.filter((track) => track.streamSafe) : playlist;
  }

  get track() {
    const tracks = this.availableTracks;
    return tracks[this.trackIndex % Math.max(1, tracks.length)] || null;
  }

  nextTrack() {
    const tracks = this.availableTracks;
    if (tracks.length) this.trackIndex = (this.trackIndex + 1) % tracks.length;
    return this.track;
  }

  get targetGain() {
    const duck = this.ducking.size ? Math.min(...this.ducking.values()) : 1;
    return this.volume * SOUNDTRACK_MIX[this.state].level * duck;
  }

  advance(dt) {
    const delta = Math.max(0, finite(dt, 0));
    const blend = 1 - Math.exp(-7 * delta);
    this.gain += (this.targetGain - this.gain) * blend;
    if (Math.abs(this.gain - this.targetGain) < 1e-6) this.gain = this.targetGain;
    return this.getSnapshot();
  }

  getSnapshot() {
    return deepFreeze({
      state: this.state,
      venueId: this.venueId,
      track: clone(this.track),
      arrangement: SOUNDTRACK_MIX[this.state].arrangement,
      intensity: SOUNDTRACK_MIX[this.state].intensity,
      userVolume: this.volume,
      streamSafe: this.streamSafe,
      ducking: [...this.ducking.keys()].sort(),
      targetGain: this.targetGain,
      gain: this.gain,
    });
  }
}

export function createSoundtrackDirector(options) {
  return new SoundtrackDirector(options);
}

// ---------------------------------------------------------------------------
// Spatial/acoustic routing and presentation-only venue conditions (72 and 76)

export const VENUE_ACOUSTICS = deepFreeze({
  montgomery: {
    space: "outdoor",
    reverbSend: 0.08,
    reflectionDelay: 0.018,
    highFrequencyDamping: 0.08,
    environmentalBed: "distant-traffic",
    announcerSpeakerOrigin: [0, 5.8, 11.5],
  },
  arena840: {
    space: "indoor",
    reverbSend: 0.42,
    reflectionDelay: 0.052,
    highFrequencyDamping: 0.24,
    environmentalBed: "arena-room-tone",
    announcerSpeakerOrigin: [0, 6.4, 0],
  },
});

const AUDIO_EVENT_CATEGORY = Object.freeze({
  bounce: "ball",
  dribble: "ball",
  rim: "rim",
  backboard: "rim",
  crowd: "crowd",
  announcer: "pa",
  commentary: "broadcast",
  ambience: "environment",
});

function vector3(value, fallback = [0, 0, 0]) {
  return Array.isArray(value) && value.length >= 3
    ? value.slice(0, 3).map((item, index) => finite(item, fallback[index]))
    : [...fallback];
}

export function routeSpatialAudioEvent({
  type,
  source,
  listener = {},
  venueId = "montgomery",
  intensity = 1,
  occlusion = 0,
} = {}) {
  const profile = VENUE_ACOUSTICS[venueId] || VENUE_ACOUSTICS.montgomery;
  const category = AUDIO_EVENT_CATEGORY[type] || "effects";
  const listenerPosition = vector3(listener.position);
  const forward = vector3(listener.forward, [0, 0, -1]);
  const origin = category === "pa" ? profile.announcerSpeakerOrigin : vector3(source);
  const dx = origin[0] - listenerPosition[0];
  const dy = origin[1] - listenerPosition[1];
  const dz = origin[2] - listenerPosition[2];
  const distance = Math.hypot(dx, dy, dz);
  const horizontal = Math.max(0.001, Math.hypot(dx, dz));
  const right = [-forward[2], 0, forward[0]];
  const rightLength = Math.max(0.001, Math.hypot(right[0], right[2]));
  const pan = category === "crowd" ? 0 : clamp((dx * right[0] + dz * right[2]) / (horizontal * rightLength), -1, 1);
  const rolloff = category === "broadcast" ? 1 : 1 / (1 + distance * (profile.space === "indoor" ? 0.07 : 0.1));
  const blocked = clamp01(occlusion);
  return deepFreeze({
    type: String(type || "effects"),
    category,
    bus: category === "broadcast" || category === "pa" ? "voice" : category === "crowd" ? "crowd" : "sfx",
    source: origin,
    distance,
    pan,
    gain: clamp01(intensity) * rolloff * (1 - blocked * 0.58),
    surroundSpread: category === "crowd" ? 1 : category === "environment" ? 0.72 : 0,
    reverbSend: category === "broadcast" ? 0 : profile.reverbSend * (category === "pa" ? 1.3 : 1),
    reflectionDelay: profile.reflectionDelay,
    lowpassHz: blocked ? 18000 - blocked * 15000 : 20000,
    speakerColoration: category === "pa" ? { highpassHz: 240, lowpassHz: 7200 } : null,
    environment: profile.environmentalBed,
  });
}

export function resolveVenuePresentationConditions({
  venueId = "montgomery",
  competitive = false,
  requested = {},
  seed = 0,
} = {}) {
  const outdoor = venueId !== "arena840";
  const requestedWeather = String(requested.weather || "clear");
  const rainAllowed = outdoor && !competitive && requestedWeather === "light-rain";
  const variants = outdoor ? ["night", "sunset"] : ["arena-night"];
  const timeOfDay = variants[hashString(`${venueId}:${seed}`) % variants.length];
  return deepFreeze({
    venueId: VENUE_ACOUSTICS[venueId] ? venueId : "montgomery",
    competitive: Boolean(competitive),
    timeOfDay,
    weather: rainAllowed ? "light-rain" : "clear",
    visualWind: outdoor ? clamp(requested.wind, 0, competitive ? 0.35 : 1) : 0,
    wetSurfaceVisual: rainAllowed,
    seasonalDecor: competitive ? "minimal" : String(requested.seasonalDecor || "none"),
    environmentalBed: outdoor ? "distant-traffic" : "arena-room-tone",
    clarity: {
      courtLines: "unobstructed",
      playerContrast: competitive ? "maximum" : "standard",
      precipitationOpacity: competitive ? 0 : rainAllowed ? 0.22 : 0,
    },
    gameplayModifiers: {
      ballPhysics: 0,
      courtFriction: 0,
      shotAccuracy: 0,
      movementSpeed: 0,
    },
  });
}

// ---------------------------------------------------------------------------
// Staggered, context-sensitive crowd reactions (requirements 73 and 100)

const CROWD_EVENTS = deepFreeze({
  dunk: { intensity: 1, animation: "rise-and-roar", participation: 0.82 },
  block: { intensity: 0.9, animation: "reject-wave", participation: 0.7 },
  "ankle-breaker": { intensity: 0.88, animation: "lean-back", participation: 0.68 },
  "long-shot": { intensity: 0.84, animation: "hands-up", participation: 0.66 },
  "missed-game-winner": { intensity: 0.76, animation: "hands-to-head", participation: 0.7 },
  "scoring-run": { intensity: 0.82, animation: "rising-wave", participation: 0.74 },
  "home-intro": { intensity: 0.72, animation: "welcome-wave", participation: 0.65 },
  "rival-intro": { intensity: 0.48, animation: "mixed-jeer", participation: 0.46 },
  "game-point": { intensity: 0.8, animation: "stand-and-clap", participation: 0.74 },
  victory: { intensity: 1, animation: "victory-roar", participation: 0.86 },
});

export class CrowdReactionDirector {
  constructor({ fanCount = 88, seed = 0 } = {}) {
    this.fanCount = Math.max(1, Math.trunc(fanCount));
    this.seed = hashString(seed);
    this.sequence = 0;
  }

  react(eventType, { at = 0, home = true, intensity = 1 } = {}) {
    const type = normalizeHighlightType(eventType);
    const preset = CROWD_EVENTS[type];
    if (!preset) return null;
    this.sequence += 1;
    const contextScale = home ? 1 : 0.72;
    const responseIntensity = clamp01(preset.intensity * clamp01(intensity) * contextScale);
    const responderCount = Math.min(
      this.fanCount - (this.fanCount > 1 ? 1 : 0),
      Math.max(1, Math.round(this.fanCount * preset.participation * (0.45 + responseIntensity * 0.55))),
    );
    const rankedFans = Array.from({ length: this.fanCount }, (_, fanId) => ({
      fanId,
      order: hashString(`${this.seed}:${this.sequence}:${type}:${fanId}`),
    })).sort((a, b) => a.order - b.order || a.fanId - b.fanId).slice(0, responderCount);
    const cohortCount = Math.min(6, Math.max(2, Math.ceil(responderCount / 12)));
    const cohorts = Array.from({ length: cohortCount }, (_, index) => ({
      delay: index * 0.075 + (hashString(`${this.seed}:${this.sequence}:delay:${index}`) % 31) / 1000,
      fanIds: [],
    }));
    rankedFans.forEach((fan, index) => cohorts[index % cohortCount].fanIds.push(fan.fanId));
    return deepFreeze({
      id: `crowd-${this.sequence}`,
      type,
      animation: preset.animation,
      intensity: responseIntensity,
      startedAt: Math.max(0, finite(at, 0)),
      responderCount,
      fanCount: this.fanCount,
      synchronized: false,
      cohorts: cohorts.filter((cohort) => cohort.fanIds.length).map((cohort) => ({
        ...cohort,
        startAt: Math.max(0, finite(at, 0)) + cohort.delay,
      })),
      audio: { delay: 0.045, intensity: responseIntensity },
    });
  }
}

export function createCrowdReactionDirector(options) {
  return new CrowdReactionDirector(options);
}
