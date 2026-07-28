/**
 * Original event-to-call director. It contains no recorded media or third-party
 * copy. The audio layer may speak the returned text with the browser's built-in
 * speech synthesizer and always mirrors it to accessible captions.
 */

export const ANNOUNCER_EVENTS = Object.freeze({
  TIP: "tip",
  SCORE: "score",
  SWISH: "swish",
  THREE: "three",
  DUNK: "dunk",
  BLOCK: "block",
  STEAL: "steal",
  REBOUND: "rebound",
  ANKLE_BREAK: "ankle_break",
  OVERTIME: "overtime",
  FINAL_MINUTE: "final_minute",
  GAME_OVER: "game_over",
  CAMERA: "camera",
});

export const ANNOUNCER_CALLS = Object.freeze({
  tip: Object.freeze([
    "The lights are up. Let the run begin.",
    "NOVA COURT is live. Protect the ball.",
  ]),
  score: Object.freeze([
    "Clean finish at the cup.",
    "Two points, earned the hard way.",
    "They found the seam and cashed it.",
  ]),
  swish: Object.freeze([
    "Nothing but night.",
    "Pure release. The net barely had a choice.",
    "That one cut straight through.",
  ]),
  three: Object.freeze([
    "Deep range, bright result.",
    "Three from beyond the pulse line.",
    "Space given, three taken.",
  ]),
  dunk: Object.freeze([
    "Above the lights with authority!",
    "The rim is still shaking!",
    "Elevation, power, finish!",
  ]),
  block: Object.freeze([
    "Access denied at the summit!",
    "Sent away under the lights!",
    "Perfect timing on the rejection.",
  ]),
  steal: Object.freeze([
    "Loose handle, live ball!",
    "Read it clean and knocked it free.",
    "The lane was open for the defense.",
  ]),
  rebound: Object.freeze([
    "Strong hands secure the glass.",
    "One shot only. Board controlled.",
  ]),
  ankle_break: Object.freeze([
    "The defender lost the rhythm!",
    "A sharp change of direction creates daylight!",
  ]),
  overtime: Object.freeze([
    "No separation. Next bucket carries everything.",
    "Extra run under the lights.",
  ]),
  final_minute: Object.freeze([
    "Final minute. Every possession is louder now.",
  ]),
  game_over: Object.freeze([
    "That is the run. Respect at center court.",
    "The horn closes another NOVA night.",
  ]),
  camera: Object.freeze([
    "New angle locked in.",
  ]),
});

const DEFAULT_COOLDOWNS = Object.freeze({
  tip: 8,
  score: 1.7,
  swish: 1.9,
  three: 2.1,
  dunk: 2.4,
  block: 2.2,
  steal: 2,
  rebound: 1.25,
  ankle_break: 2.6,
  overtime: 10,
  final_minute: 30,
  game_over: 10,
  camera: 0.65,
});

function hash(seed) {
  const input = String(seed ?? "");
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function crowdCueFor(eventType, payload = {}) {
  const type = String(eventType || "").toLowerCase();
  const closeGame = Math.abs(Number(payload.homeScore || 0) - Number(payload.awayScore || 0)) <= 2;
  const table = {
    tip: { intensity: 0.48, duration: 1.2, chant: false },
    score: { intensity: closeGame ? 0.72 : 0.55, duration: 1.15, chant: false },
    swish: { intensity: closeGame ? 0.8 : 0.62, duration: 1.25, chant: false },
    three: { intensity: closeGame ? 0.92 : 0.76, duration: 1.55, chant: false },
    dunk: { intensity: 1, duration: 2.1, chant: true },
    block: { intensity: 0.94, duration: 1.65, chant: true },
    steal: { intensity: 0.75, duration: 1.15, chant: false },
    ankle_break: { intensity: 0.88, duration: 1.7, chant: true },
    overtime: { intensity: 1, duration: 2.5, chant: true },
    game_over: { intensity: payload.userWon === false ? 0.3 : 0.9, duration: 2.4, chant: payload.userWon !== false },
  };
  return { type: "crowd", ...(table[type] || { intensity: 0.32, duration: 0.8, chant: false }) };
}

export class AnnouncerDirector {
  constructor({ enabled = true, cooldowns = {}, clock = () => performance.now() / 1000 } = {}) {
    this.enabled = enabled;
    this.cooldowns = { ...DEFAULT_COOLDOWNS, ...cooldowns };
    this.clock = clock;
    this.lastCallAt = new Map();
    this.sequence = 0;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
  }

  reset() {
    this.lastCallAt.clear();
    this.sequence = 0;
  }

  announce(eventType, payload = {}) {
    if (!this.enabled) return null;
    const type = String(eventType || "").toLowerCase();
    const lines = ANNOUNCER_CALLS[type];
    if (!lines?.length) return null;
    const now = Number(payload.now ?? this.clock());
    const last = this.lastCallAt.get(type) ?? -Infinity;
    const cooldown = Math.max(0, Number(this.cooldowns[type]) || 0);
    if (now - last < cooldown && !payload.force) return null;
    this.lastCallAt.set(type, now);
    this.sequence += 1;
    const index = hash(`${type}:${payload.seed ?? this.sequence}:${payload.playerName ?? ""}`) % lines.length;
    let text = lines[index];
    if (payload.playerName && ["score", "swish", "three", "dunk", "block", "steal", "rebound"].includes(type)) {
      text = `${payload.playerName}. ${text}`;
    }
    return {
      id: `call-${this.sequence}`,
      clip: `${type}-${index + 1}`,
      type,
      text,
      priority: ["dunk", "block", "ankle_break", "overtime", "game_over"].includes(type) ? "high" : "normal",
      interrupt: ["overtime", "game_over"].includes(type),
      crowd: crowdCueFor(type, payload),
    };
  }
}

export function createAnnouncerDirector(options) {
  return new AnnouncerDirector(options);
}

