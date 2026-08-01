/**
 * Deterministic basketball-intelligence primitives for NOVA COURT.
 *
 * This module is intentionally independent of Three.js, the DOM, and the game
 * clock. It consumes authored game facts and returns bounded recommendations;
 * the engine and mode controllers remain authoritative for animation, rules,
 * lineups, and outcomes.
 */

export const BASKETBALL_INTELLIGENCE_VERSION = "1.0.0";

const clamp = (value, min = 0, max = 1) => {
  const resolved = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(resolved) ? resolved : min));
};

const finite = (value, fallback = 0) => {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : fallback;
};

const normalizeId = (value) => String(value ?? "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");

const titleCase = (value, fallback = "Unknown") => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;
  return normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

function stableHash(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(value) {
  return stableHash(value) / 4294967295;
}

const PUBLIC_ATTRIBUTE_LABELS = Object.freeze({
  shooting: "Shot Making",
  threePoint: "Three-Point Shot",
  midrange: "Midrange Scoring",
  finishing: "Finishing",
  layup: "Finishing",
  dunk: "Above-the-Rim Finishing",
  handles: "Ball Handling",
  ballHandling: "Ball Handling",
  passing: "Playmaking",
  speed: "Speed",
  acceleration: "First Step",
  strength: "Strength",
  defense: "Defense",
  perimeterDefense: "Perimeter Defense",
  interiorDefense: "Interior Defense",
  steal: "Ball Pressure",
  block: "Rim Protection",
  rebounding: "Rebounding",
  stamina: "Motor",
});

const DEFENSIVE_WEAKNESS_LABELS = Object.freeze({
  perimeterDefense: "Can be shaken in space",
  interiorDefense: "Vulnerable at the rim",
  lateralQuickness: "Struggles with quick direction changes",
  screenNavigation: "Can be caught on screens",
  closeout: "Late closing to shooters",
  discipline: "Bites on fakes",
  strength: "Can be displaced by stronger scorers",
  steal: "Does not create many takeaways",
  block: "Limited rim deterrence",
  rebounding: "Can be beaten to second chances",
});

const SCORING_AREA_LABELS = Object.freeze({
  rim: "At the rim",
  paint: "In the paint",
  post: "Low post",
  midrange: "Midrange",
  left_midrange: "Left midrange",
  right_midrange: "Right midrange",
  three: "Beyond the arc",
  corner_three: "Corner three",
  left_corner: "Left corner",
  right_corner: "Right corner",
  top: "Top of the key",
});

const FAVORITE_MOVE_LABELS = Object.freeze({
  crossover: "Crossover",
  hesitation: "Hesitation",
  stepback: "Stepback",
  spin: "Spin move",
  euro_step: "Euro step",
  pull_up: "Pull-up jumper",
  post_spin: "Post spin",
  drop_step: "Drop step",
  floater: "Floater",
  drive: "Straight-line drive",
});

function rankedKey(record, direction = "max") {
  const candidates = Object.entries(record || {})
    .filter(([, value]) => Number.isFinite(Number(value)))
    .sort((a, b) => {
      const delta = finite(b[1]) - finite(a[1]);
      return (direction === "min" ? -delta : delta) || a[0].localeCompare(b[0]);
    });
  return candidates[0]?.[0] ?? null;
}

function recentRecord(games, maximum = 5) {
  const recent = Array.isArray(games) ? games.slice(-Math.max(1, maximum)) : [];
  let wins = 0;
  let losses = 0;
  for (const game of recent) {
    const result = normalizeId(game?.result ?? game);
    if (result === "w" || result === "win" || game?.won === true) wins += 1;
    if (result === "l" || result === "loss" || game?.won === false) losses += 1;
  }
  if (wins + losses === 0) return "No recent games";
  const latestResult = recent.at(-1)?.result ?? recent.at(-1);
  const latestWin = normalizeId(latestResult) === "w"
    || normalizeId(latestResult) === "win"
    || recent.at(-1)?.won === true;
  let streak = 0;
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const item = recent[index];
    const won = normalizeId(item?.result ?? item) === "w"
      || normalizeId(item?.result ?? item) === "win"
      || item?.won === true;
    if (won !== latestWin) break;
    streak += 1;
  }
  return `${wins}-${losses}${streak > 1 ? ` Â· ${latestWin ? "W" : "L"}${streak}` : ""}`;
}

/**
 * Builds the seven-field pregame report. Numerical ratings and raw tendency
 * weights are deliberately never returned, even if they are present in input.
 */
export function buildOpponentScout(opponent = {}, options = {}) {
  const attributes = opponent.attributes || opponent.ratings || {};
  const defenses = opponent.defensiveRatings || opponent.defense || {};
  const zoneKey = normalizeId(
    opponent.preferredScoringArea
      ?? opponent.preferredZone
      ?? rankedKey(opponent.scoringZones || opponent.zoneTendencies),
  );
  const strongestKey = rankedKey(
    Object.fromEntries(Object.entries(attributes).filter(([key]) => PUBLIC_ATTRIBUTE_LABELS[key])),
  );
  const weakestDefenseKey = rankedKey(
    Object.fromEntries(Object.entries(defenses).filter(([key]) => DEFENSIVE_WEAKNESS_LABELS[key])),
    "min",
  );
  const dominantHand = normalizeId(opponent.dominantHand) === "left" ? "Left" : "Right";
  const archetype = opponent.primaryArchetype
    ?? opponent.archetype
    ?? inferPrimaryArchetype(opponent.tendencies || {});
  const favoriteMoveKey = normalizeId(
    opponent.favoriteMove ?? rankedKey(opponent.moves || opponent.moveTendencies),
  );

  return freezeDeep({
    preferredScoringArea: SCORING_AREA_LABELS[zoneKey] || titleCase(zoneKey, "Balanced scorer"),
    dominantHand,
    strongestAttribute: PUBLIC_ATTRIBUTE_LABELS[strongestKey] || "All-around game",
    defensiveWeakness: DEFENSIVE_WEAKNESS_LABELS[weakestDefenseKey] || "No obvious weakness",
    recentRecord: recentRecord(opponent.recentGames, options.recentGameLimit ?? 5),
    primaryArchetype: titleCase(archetype, "Two-way competitor"),
    favoriteMove: FAVORITE_MOVE_LABELS[favoriteMoveKey] || titleCase(favoriteMoveKey, "Reads the defense"),
  });
}

export const DIFFICULTY_PROFILES = freezeDeep({
  rookie: { learningRate: 0.52, decay: 0.76, maxAdjustment: 0.12, mistakeRate: 0.34 },
  street: { learningRate: 0.68, decay: 0.79, maxAdjustment: 0.16, mistakeRate: 0.24 },
  pro: { learningRate: 0.84, decay: 0.82, maxAdjustment: 0.21, mistakeRate: 0.14 },
  legend: { learningRate: 1, decay: 0.85, maxAdjustment: 0.25, mistakeRate: 0.08 },
});

export const ADAPTATION_OBSERVATIONS = Object.freeze({
  CROSSOVER: "crossover",
  THREE_MADE: "three_made",
  THREE_MISSED: "three_missed",
  DRIVE: "drive",
  PASS_FAKE: "pass_fake",
  MATCHUP_LOSS: "matchup_loss",
});

const EMPTY_EVIDENCE = Object.freeze({
  crossover: 0,
  threeMade: 0,
  threeMissed: 0,
  drive: 0,
  passFake: 0,
});

function adaptationAmount(evidence, profile, onset = 1.2, span = 3.6) {
  const confidence = clamp((evidence - onset) / span);
  return clamp(confidence * profile.learningRate * profile.maxAdjustment, 0, profile.maxAdjustment);
}

function observationWeight(observation) {
  const success = observation.success;
  const quality = clamp(observation.quality ?? observation.severity ?? 1, 0.25, 1.25);
  return quality * (success === false ? 0.58 : 1);
}

function normalizedObservationType(observation) {
  const type = normalizeId(observation?.type ?? observation?.action ?? observation?.kind);
  const outcome = normalizeId(observation?.outcome);
  if ((type === "three" || type === "three_pointer" || type === "three_point_shot") && outcome === "made") {
    return ADAPTATION_OBSERVATIONS.THREE_MADE;
  }
  if ((type === "three" || type === "three_pointer" || type === "three_point_shot") && (outcome === "missed" || outcome === "miss")) {
    return ADAPTATION_OBSERVATIONS.THREE_MISSED;
  }
  return type;
}

function chooseReplacement(availableDefenders, excludedId) {
  return (Array.isArray(availableDefenders) ? availableDefenders : [])
    .filter((player) => String(player?.id) !== String(excludedId))
    .map((player) => ({
      player,
      score: clamp(player.matchupDefense ?? player.perimeterDefense ?? player.defense ?? 0.5),
    }))
    .sort((a, b) => b.score - a.score || String(a.player.id).localeCompare(String(b.player.id)))[0]?.player ?? null;
}

/**
 * Stateful, bounded possession learner. Each observation is applied only after
 * the completed possession and old evidence decays, preventing first-event or
 * permanent "psychic" counters. Identical seed/input sequences are identical.
 */
export function createAdaptiveDefense({ difficulty = "pro", seed = 1, historyLimit = 24 } = {}) {
  const difficultyId = DIFFICULTY_PROFILES[difficulty] ? difficulty : "pro";
  const profile = DIFFICULTY_PROFILES[difficultyId];
  const boundedHistoryLimit = Math.max(1, Math.min(120, Math.round(finite(historyLimit, 24))));
  let possession = 0;
  let evidence = { ...EMPTY_EVIDENCE };
  let matchupEvidence = new Map();
  let history = [];

  function decayEvidence(steps = 1) {
    const factor = profile.decay ** Math.max(1, steps);
    for (const key of Object.keys(evidence)) evidence[key] *= factor;
    matchupEvidence = new Map(
      [...matchupEvidence.entries()]
        .map(([id, value]) => [id, value * factor])
        .filter(([, value]) => value >= 0.025),
    );
  }

  function observePossession(observations = [], metadata = {}) {
    possession += 1;
    decayEvidence(1);
    const normalized = [];
    for (const observation of Array.isArray(observations) ? observations : [observations]) {
      if (!observation) continue;
      const type = normalizedObservationType(observation);
      const weight = observationWeight(observation);
      if (type === ADAPTATION_OBSERVATIONS.CROSSOVER) evidence.crossover += weight;
      if (type === ADAPTATION_OBSERVATIONS.THREE_MADE) evidence.threeMade += weight;
      if (type === ADAPTATION_OBSERVATIONS.THREE_MISSED) evidence.threeMissed += weight;
      if (type === ADAPTATION_OBSERVATIONS.DRIVE) evidence.drive += weight;
      if (type === ADAPTATION_OBSERVATIONS.PASS_FAKE) evidence.passFake += weight;
      if (type === ADAPTATION_OBSERVATIONS.MATCHUP_LOSS && observation.defenderId != null) {
        const defenderId = String(observation.defenderId);
        matchupEvidence.set(defenderId, (matchupEvidence.get(defenderId) || 0) + weight);
      }
      normalized.push(freezeDeep({ type, weight, defenderId: observation.defenderId ?? null }));
    }
    history.push(freezeDeep({
      possession,
      possessionId: metadata.possessionId ?? possession,
      observations: normalized,
    }));
    if (history.length > boundedHistoryLimit) history = history.slice(-boundedHistoryLimit);
    return getPlan(metadata);
  }

  function realized(signal, amount) {
    if (amount <= 0) return { amount: 0, mistake: false };
    const roll = stableUnit(`${seed}:${possession}:${signal}`);
    const mistake = roll < profile.mistakeRate;
    return { amount: mistake ? amount * 0.35 : amount, mistake };
  }

  function getPlan(context = {}) {
    const raw = {
      crossoverPressure: adaptationAmount(evidence.crossover, profile, 1.15),
      threePointCloseout: adaptationAmount(evidence.threeMade, profile, 1.1),
      shooterGap: adaptationAmount(evidence.threeMissed - evidence.threeMade * 0.8, profile, 1.45),
      paintProtection: adaptationAmount(evidence.drive, profile, 1.2),
      passFakeDiscipline: adaptationAmount(evidence.passFake, profile, 1.15),
    };
    const adjustments = {};
    const mistakes = {};
    for (const [signal, amount] of Object.entries(raw)) {
      const result = realized(signal, amount);
      adjustments[signal] = result.amount;
      mistakes[signal] = result.mistake;
    }

    const worstMatchup = [...matchupEvidence.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
    const switchAmount = adaptationAmount(worstMatchup?.[1] ?? 0, profile, 1.4, 3.2);
    const switchRead = realized(`switch:${worstMatchup?.[0] ?? "none"}`, switchAmount);
    const replacement = chooseReplacement(context.availableDefenders, worstMatchup?.[0]);
    const switchDefender = {
      recommended: switchRead.amount >= profile.maxAdjustment * 0.22,
      fromDefenderId: worstMatchup?.[0] ?? null,
      toDefenderId: replacement?.id ?? null,
      urgency: switchRead.amount,
      mistake: switchRead.mistake,
    };

    const recommendations = [];
    if (adjustments.crossoverPressure > 0) recommendations.push("shade_repeated_crossover");
    if (adjustments.threePointCloseout > 0) recommendations.push("harder_three_point_closeout");
    if (adjustments.shooterGap > 0) recommendations.push("give_poor_shooter_space");
    if (adjustments.paintProtection > 0) recommendations.push("protect_paint");
    if (adjustments.passFakeDiscipline > 0) recommendations.push("stay_home_on_pass_fake");
    if (switchDefender.recommended) recommendations.push("change_matchup");

    return freezeDeep({
      difficulty: difficultyId,
      possession,
      maxAdjustment: profile.maxAdjustment,
      mistakeRate: profile.mistakeRate,
      adjustments,
      mistakes,
      switchDefender,
      recommendations,
    });
  }

  function getSnapshot() {
    return freezeDeep({
      difficulty: difficultyId,
      possession,
      evidence: { ...evidence },
      matchupEvidence: Object.fromEntries(matchupEvidence),
      history: [...history],
      historyLimit: boundedHistoryLimit,
    });
  }

  function reset() {
    possession = 0;
    evidence = { ...EMPTY_EVIDENCE };
    matchupEvidence = new Map();
    history = [];
  }

  return Object.freeze({ observePossession, getPlan, getSnapshot, reset });
}

export const FOUL_PRESET_IDS = Object.freeze({
  STREET: "street",
  COMPETITIVE: "competitive",
  SIMULATION: "simulation",
  NO_BLOOD_NO_FOUL: "no_blood_no_foul",
  SHOOTING_LAB: "shooting_lab",
});

export const FOUL_RULE_PRESETS = freezeDeep({
  [FOUL_PRESET_IDS.STREET]: {
    label: "Street",
    summary: "Minimal calls; dangerous or heavy contact is still called.",
    callsEnabled: true,
    threshold: 0.72,
    shootingThreshold: 0.64,
    obviousOnly: false,
  },
  [FOUL_PRESET_IDS.COMPETITIVE]: {
    label: "Competitive",
    summary: "Only clear, consequential contact is called.",
    callsEnabled: true,
    threshold: 0.6,
    shootingThreshold: 0.54,
    obviousOnly: true,
  },
  [FOUL_PRESET_IDS.SIMULATION]: {
    label: "Simulation",
    summary: "Full officiating for shooting, reach, block, charge, hold, and loose-ball fouls.",
    callsEnabled: true,
    threshold: 0.43,
    shootingThreshold: 0.4,
    obviousOnly: false,
  },
  [FOUL_PRESET_IDS.NO_BLOOD_NO_FOUL]: {
    label: "No Blood, No Foul",
    summary: "Only extreme contact stops play.",
    callsEnabled: true,
    threshold: 0.9,
    shootingThreshold: 0.86,
    obviousOnly: false,
  },
  [FOUL_PRESET_IDS.SHOOTING_LAB]: {
    label: "Shooting Lab",
    summary: "Fouls are disabled.",
    callsEnabled: false,
    threshold: 1,
    shootingThreshold: 1,
    obviousOnly: false,
  },
});

export function getFoulPreset(presetId = FOUL_PRESET_IDS.STREET) {
  const id = FOUL_RULE_PRESETS[presetId] ? presetId : FOUL_PRESET_IDS.STREET;
  return freezeDeep({ id, ...FOUL_RULE_PRESETS[id] });
}

/** Applies a preset to an existing collision/contact classification. */
export function evaluateFoulCall(classification = {}, presetId = FOUL_PRESET_IDS.STREET) {
  const preset = getFoulPreset(presetId);
  const severity = clamp(classification.severity ?? classification.risk ?? 0);
  const foulType = normalizeId(classification.type ?? classification.foulType ?? "none");
  const isShooting = Boolean(classification.shooting) || foulType === "shooting";
  const threshold = isShooting ? preset.shootingThreshold : preset.threshold;
  const classificationSaysFoul = classification.isFoul !== false && foulType !== "none";
  const obvious = classification.obvious === true || severity >= threshold + 0.12;
  let called = preset.callsEnabled && classificationSaysFoul && severity >= threshold;
  if (preset.obviousOnly && !obvious) called = false;
  return freezeDeep({
    presetId: preset.id,
    presetLabel: preset.label,
    called,
    reason: !preset.callsEnabled
      ? "fouls_disabled"
      : !classificationSaysFoul
        ? "clean_play"
        : called
          ? "threshold_met"
          : preset.obviousOnly && !obvious
            ? "not_obvious"
            : "below_threshold",
    foulType,
    severity,
    threshold,
  });
}

export const POSITION_COMPATIBILITY = freezeDeep({
  PG: { PG: 1, SG: 0.78 },
  SG: { SG: 1, PG: 0.76, SF: 0.72 },
  SF: { SF: 1, SG: 0.72, PF: 0.72 },
  PF: { PF: 1, SF: 0.72, C: 0.76 },
  C: { C: 1, PF: 0.78 },
});

function playerPositions(player = {}) {
  const positions = player.eligiblePositions
    ?? player.positions
    ?? [player.courtPosition ?? player.positionRole ?? player.role];
  return (Array.isArray(positions) ? positions : [positions])
    .map((position) => String(position ?? "").toUpperCase())
    .filter((position) => POSITION_COMPATIBILITY[position]);
}

export function positionCompatibility(player, lineupPosition) {
  const target = String(lineupPosition ?? "").toUpperCase();
  let best = 0;
  for (const position of playerPositions(player)) {
    best = Math.max(best, POSITION_COMPATIBILITY[position]?.[target] ?? 0);
  }
  return best;
}

const SUBSTITUTION_DISABLED_MODES = new Set([
  "park_duel", "street_1v1", "duos", "half_court_2v2", "trios",
  "half_court_3v3", "quads", "half_court_4v4", "three_point_contest",
  "arc_run", "open_gym", "shooting_lab",
]);

export function substitutionPolicy(mode = {}) {
  const input = typeof mode === "string" ? { id: mode } : mode;
  const id = normalizeId(input.id ?? input.modeId ?? input.key);
  const playersPerTeam = Math.max(1, Math.round(finite(input.playersPerTeam, id.includes("five") ? 5 : 1)));
  const street = input.street === true || SUBSTITUTION_DISABLED_MODES.has(id);
  const enabled = input.substitutionsEnabled != null
    ? Boolean(input.substitutionsEnabled) && !street
    : !street && playersPerTeam >= 5;
  return freezeDeep({
    modeId: id || "unknown",
    enabled,
    reason: enabled ? "full_team_mode" : street ? "street_mode" : "insufficient_team_size",
    liveSubstitutionLimit: enabled ? 1 : 0,
    timeoutSubstitutionLimit: enabled ? playersPerTeam : 0,
  });
}

function fatigueOf(player) {
  if (Number.isFinite(Number(player?.fatigue))) return clamp(player.fatigue);
  return 1 - clamp(player?.stamina ?? 1);
}

function candidateScore(player, position, preset) {
  const compatibility = positionCompatibility(player, position);
  if (compatibility <= 0) return -Infinity;
  const freshness = 1 - fatigueOf(player);
  const starter = normalizeId(player.rotationRole ?? player.rosterRole) === "starter" ? 1 : 0;
  let skill = freshness;
  if (preset === "shooting") skill = clamp(player.shooting ?? player.threePoint ?? 0.5);
  if (preset === "defense") skill = clamp(player.defense ?? player.perimeterDefense ?? 0.5);
  if (preset === "size") skill = clamp((finite(player.rebounding, 0.5) + finite(player.interiorDefense, 0.5)) / 2);
  if (preset === "starters") skill = starter;
  return compatibility * 0.54 + freshness * 0.24 + skill * 0.22;
}

function substitutionResult(policy, lineup, substitutions, rejected = []) {
  return freezeDeep({
    enabled: policy.enabled,
    reason: policy.reason,
    substitutions,
    rejected,
    nextLineup: lineup,
  });
}

/**
 * Returns a legal substitution plan without mutating either roster. The caller
 * chooses whether/when to apply it. Manual requests are validated before auto
 * fatigue/preset rotations are considered.
 */
export function planSubstitutions({
  mode = {},
  lineup = [],
  bench = [],
  trigger = "live",
  manualRequests = [],
  fatigueThreshold = 0.72,
  lineupPreset = "fresh",
} = {}) {
  const policy = substitutionPolicy(mode);
  const current = (Array.isArray(lineup) ? lineup : []).map((player) => ({ ...player }));
  if (!policy.enabled) return substitutionResult(policy, current, []);
  const available = (Array.isArray(bench) ? bench : []).map((player) => ({ ...player }));
  const timeout = normalizeId(trigger) === "timeout";
  const limit = timeout ? policy.timeoutSubstitutionLimit : policy.liveSubstitutionLimit;
  const changes = [];
  const rejected = [];
  const usedIncoming = new Set();
  const usedOutgoing = new Set();

  function addChange(outPlayer, inPlayer, reason) {
    if (!outPlayer || !inPlayer || changes.length >= limit) return false;
    const position = String(outPlayer.lineupPosition ?? outPlayer.courtPosition ?? outPlayer.positionRole ?? "").toUpperCase();
    const compatibility = positionCompatibility(inPlayer, position);
    if (compatibility <= 0 || usedIncoming.has(String(inPlayer.id)) || usedOutgoing.has(String(outPlayer.id))) return false;
    const index = current.findIndex((player) => String(player.id) === String(outPlayer.id));
    if (index < 0) return false;
    current[index] = { ...inPlayer, lineupPosition: position };
    usedIncoming.add(String(inPlayer.id));
    usedOutgoing.add(String(outPlayer.id));
    changes.push({
      outPlayerId: outPlayer.id,
      inPlayerId: inPlayer.id,
      lineupPosition: position,
      compatibility,
      reason,
    });
    return true;
  }

  for (const request of Array.isArray(manualRequests) ? manualRequests : []) {
    if (changes.length >= limit) break;
    const outgoing = current.find((player) => String(player.id) === String(request.outPlayerId));
    const incoming = available.find((player) => String(player.id) === String(request.inPlayerId));
    if (!addChange(outgoing, incoming, timeout ? "timeout_manual" : "manual")) {
      rejected.push({ ...request, reason: "invalid_or_position_incompatible" });
    }
  }

  const preset = normalizeId(lineupPreset) || "fresh";
  const autoCandidates = current
    .filter((player) => !usedOutgoing.has(String(player.id)))
    .map((player) => ({ player, fatigue: fatigueOf(player) }))
    .filter(({ fatigue }) => fatigue >= clamp(fatigueThreshold) || timeout || preset === "starters")
    .sort((a, b) => b.fatigue - a.fatigue || String(a.player.id).localeCompare(String(b.player.id)));

  for (const { player: outgoing, fatigue } of autoCandidates) {
    if (changes.length >= limit) break;
    const position = String(outgoing.lineupPosition ?? outgoing.courtPosition ?? outgoing.positionRole ?? "").toUpperCase();
    const incoming = available
      .filter((player) => !usedIncoming.has(String(player.id)))
      .map((player) => ({ player, score: candidateScore(player, position, preset) }))
      .filter(({ score }) => Number.isFinite(score))
      .sort((a, b) => b.score - a.score || String(a.player.id).localeCompare(String(b.player.id)))[0]?.player;
    addChange(outgoing, incoming, timeout ? `timeout_${preset}` : fatigue >= clamp(fatigueThreshold) ? "fatigue" : preset);
  }

  return substitutionResult(policy, current, changes, rejected);
}

export const CHEMISTRY_EVENTS = freezeDeep({
  assist: 0.09,
  screen: 0.055,
  defensive_help: 0.06,
  good_spacing: 0.035,
  successful_rotation: 0.055,
  win: 0.045,
});

function pairKey(first, second) {
  return [String(first), String(second)].sort().join("::");
}

/** Pair chemistry is stored as 0..1 bond but converts to at most a 3.5% bonus. */
export function createChemistryTracker({ maxBonus = 0.035, decay = 0.985 } = {}) {
  const boundedMaxBonus = clamp(maxBonus, 0, 0.05);
  const decayFactor = clamp(decay, 0.8, 1);
  const bonds = new Map();

  function recordEvent(type, { playerIds = [], quality = 1 } = {}) {
    const id = normalizeId(type);
    const gain = CHEMISTRY_EVENTS[id];
    const unique = [...new Set((Array.isArray(playerIds) ? playerIds : []).map(String))].sort();
    if (!gain || unique.length < 2) return getSnapshot();
    for (let first = 0; first < unique.length - 1; first += 1) {
      for (let second = first + 1; second < unique.length; second += 1) {
        const key = pairKey(unique[first], unique[second]);
        bonds.set(key, clamp((bonds.get(key) || 0) + gain * clamp(quality, 0.25, 1.25)));
      }
    }
    return getSnapshot();
  }

  function decayChemistry(periods = 1) {
    const factor = decayFactor ** Math.max(0, finite(periods, 1));
    for (const [key, bond] of bonds) {
      const next = bond * factor;
      if (next < 0.0001) bonds.delete(key);
      else bonds.set(key, next);
    }
    return getSnapshot();
  }

  function getPair(first, second) {
    const bond = bonds.get(pairKey(first, second)) || 0;
    return freezeDeep({ bond, bonus: bond * boundedMaxBonus, maxBonus: boundedMaxBonus });
  }

  function getSnapshot() {
    return freezeDeep({
      maxBonus: boundedMaxBonus,
      pairs: Object.fromEntries([...bonds.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    });
  }

  return Object.freeze({ recordEvent, decay: decayChemistry, getPair, getSnapshot });
}

export const TENDENCY_IDS = Object.freeze({
  PASS_FIRST: "pass_first",
  ISOLATION_HEAVY: "isolation_heavy",
  AGGRESSIVE_FINISHER: "aggressive_finisher",
  CAUTIOUS_SHOOTER: "cautious_shooter",
  HELP_DEFENDER: "help_defender",
  REBOUND_CHASER: "rebound_chaser",
  TRANSITION_RUNNER: "transition_runner",
  SCREEN_SETTER: "screen_setter",
  RISKY_DEFENDER: "risky_defender",
});

export const ARCHETYPE_PRESETS = freezeDeep({
  floor_general: { pass_first: 0.9, cautious_shooter: 0.35, screen_setter: 0.25 },
  isolation_creator: { isolation_heavy: 0.9, aggressive_finisher: 0.65, pass_first: 0.15 },
  downhill_finisher: { aggressive_finisher: 0.95, transition_runner: 0.6 },
  two_way_wing: { help_defender: 0.7, transition_runner: 0.55, rebound_chaser: 0.35 },
  glass_cleaner: { rebound_chaser: 0.95, screen_setter: 0.65, help_defender: 0.5 },
  defensive_gambler: { risky_defender: 0.9, transition_runner: 0.55 },
});

function inferPrimaryArchetype(tendencies = {}) {
  let best = "two_way_wing";
  let bestSimilarity = -Infinity;
  for (const [archetype, preset] of Object.entries(ARCHETYPE_PRESETS)) {
    let similarity = 0;
    for (const [id, weight] of Object.entries(preset)) {
      similarity += clamp(tendencies[id]) * weight;
    }
    if (similarity > bestSimilarity) {
      best = archetype;
      bestSimilarity = similarity;
    }
  }
  return best;
}

export function createBehaviorProfile({ archetype = "two_way_wing", tendencies = {} } = {}) {
  const archetypeId = ARCHETYPE_PRESETS[normalizeId(archetype)] ? normalizeId(archetype) : "two_way_wing";
  const base = ARCHETYPE_PRESETS[archetypeId];
  const supplied = Array.isArray(tendencies)
    ? Object.fromEntries(tendencies.map((id) => [normalizeId(id), 1]))
    : tendencies;
  const normalized = {};
  for (const id of Object.values(TENDENCY_IDS)) {
    normalized[id] = clamp(supplied?.[id] ?? base[id] ?? 0);
  }
  return freezeDeep({ archetype: archetypeId, tendencies: normalized, maxDecisionBias: 0.16 });
}

function tendencyBias(action, profile, context) {
  const t = profile.tendencies;
  const normalizedAction = normalizeId(action);
  let bias = 0;
  if (["pass", "kick_out", "alley_oop_pass"].includes(normalizedAction)) bias += t.pass_first * 0.13 - t.isolation_heavy * 0.06;
  if (["isolation", "iso", "crossover", "stepback"].includes(normalizedAction)) bias += t.isolation_heavy * 0.13 - t.pass_first * 0.05;
  if (["drive", "finish", "layup", "dunk"].includes(normalizedAction)) bias += t.aggressive_finisher * 0.12;
  if (["shoot", "three", "pull_up"].includes(normalizedAction)) bias -= t.cautious_shooter * (context.open ? 0.035 : 0.12);
  if (["help", "rotate", "double"].includes(normalizedAction)) bias += t.help_defender * 0.11 - t.risky_defender * 0.025;
  if (["rebound", "crash_glass", "box_out"].includes(normalizedAction)) bias += t.rebound_chaser * 0.12;
  if (["run_lane", "transition", "leak_out"].includes(normalizedAction)) bias += t.transition_runner * 0.12;
  if (["screen", "rescreen"].includes(normalizedAction)) bias += t.screen_setter * 0.12;
  if (["steal", "jump_lane", "reach"].includes(normalizedAction)) bias += t.risky_defender * 0.11;
  return Math.max(-profile.maxDecisionBias, Math.min(profile.maxDecisionBias, bias));
}

/** Adds small behavioral biases to precomputed skill/context utilities. */
export function applyBehaviorProfile(candidates = [], profileInput = {}, context = {}) {
  const profile = profileInput?.tendencies ? profileInput : createBehaviorProfile(profileInput);
  const scored = (Array.isArray(candidates) ? candidates : []).map((candidate, index) => {
    const bias = tendencyBias(candidate.action, profile, context);
    return {
      ...candidate,
      baseScore: clamp(candidate.score),
      tendencyBias: bias,
      score: clamp(finite(candidate.score) + bias),
      _index: index,
    };
  }).sort((a, b) => b.score - a.score || a._index - b._index)
    .map(({ _index, ...candidate }) => candidate);
  return freezeDeep({
    archetype: profile.archetype,
    chosen: scored[0]?.action ?? null,
    candidates: scored,
  });
}

export function deriveGameStateSignals({
  homeScore = 0,
  awayScore = 0,
  targetScore = 21,
  scoringRun = 0,
  scoringRunTeamId = null,
  possessionTeamId = null,
  gameOver = false,
} = {}) {
  const home = Math.max(0, finite(homeScore));
  const away = Math.max(0, finite(awayScore));
  const target = Math.max(1, finite(targetScore, 21));
  const margin = Math.abs(home - away);
  const leaderTeamId = home === away ? null : home > away ? "home" : "away";
  const gamePointTeams = [];
  if (!gameOver && home >= target - 1) gamePointTeams.push("home");
  if (!gameOver && away >= target - 1) gamePointTeams.push("away");
  const run = Math.max(0, finite(scoringRun));
  const intensity = clamp(
    0.18
      + clamp(Math.max(home, away) / target) * 0.34
      + (margin <= 2 ? 0.16 : 0)
      + clamp(run / 8) * 0.16
      + (gamePointTeams.length ? 0.24 : 0)
      + (gameOver ? 0.2 : 0),
  );
  return freezeDeep({
    homeScore: home,
    awayScore: away,
    margin,
    leaderTeamId,
    possessionTeamId,
    closeGame: margin <= 2,
    gamePoint: gamePointTeams.length > 0,
    gamePointTeams,
    scoringRun: run,
    scoringRunTeamId,
    gameOver: Boolean(gameOver),
    intensity,
  });
}

const CROWD_REACTIONS = freezeDeep({
  dunk: { reaction: "eruption", intensity: 0.9, sections: 6 },
  block: { reaction: "shock_then_roar", intensity: 0.82, sections: 5 },
  ankle_breaker: { reaction: "gasp_then_roar", intensity: 0.92, sections: 6 },
  long_shot: { reaction: "rising_roar", intensity: 0.78, sections: 5 },
  missed_game_winner: { reaction: "collective_gasp", intensity: 0.96, sections: 7 },
  scoring_run: { reaction: "building_chant", intensity: 0.76, sections: 5 },
  home_introduction: { reaction: "home_welcome", intensity: 0.68, sections: 6 },
  rival_introduction: { reaction: "mixed_boo", intensity: 0.72, sections: 5 },
  game_point: { reaction: "standing_tension", intensity: 0.88, sections: 7 },
  final_victory: { reaction: "victory_eruption", intensity: 1, sections: 7 },
});

/**
 * Creates a staggered crowd cue. At least one section remains inactive so a
 * normal play never makes every spectator perform the same reaction in sync.
 */
export function createCrowdCue(event = {}, gameState = {}, { seed = 1, sectionCount = 8 } = {}) {
  let type = normalizeId(event.type ?? event.kind);
  if (type === "made_shot" && finite(event.distance) >= 8) type = "long_shot";
  if (type === "introduction") type = event.rival ? "rival_introduction" : "home_introduction";
  if (type === "victory" || type === "game_over") type = "final_victory";
  if (type === "missed_shot" && event.gameWinner === true) type = "missed_game_winner";
  const definition = CROWD_REACTIONS[type];
  if (!definition) return null;
  const state = gameState?.intensity != null ? gameState : deriveGameStateSignals(gameState);
  const totalSections = Math.max(2, Math.min(16, Math.round(finite(sectionCount, 8))));
  const activeCount = Math.min(totalSections - 1, definition.sections);
  const start = stableHash(`${seed}:${event.eventId ?? event.id ?? type}`) % totalSections;
  const activeSections = [];
  for (let index = 0; index < activeCount; index += 1) {
    const section = (start + index * 3) % totalSections;
    if (!activeSections.includes(section)) activeSections.push(section);
  }
  for (let section = 0; activeSections.length < activeCount && section < totalSections; section += 1) {
    if (!activeSections.includes(section)) activeSections.push(section);
  }
  const staggerMs = activeSections.map((section, index) => ({
    section,
    delayMs: index * 85 + Math.round(stableUnit(`${seed}:${type}:${section}`) * 55),
  }));
  return freezeDeep({
    eventType: type,
    reaction: definition.reaction,
    intensity: clamp(definition.intensity * 0.72 + state.intensity * 0.28),
    activeSections,
    inactiveSectionCount: totalSections - activeSections.length,
    staggerMs,
  });
}
