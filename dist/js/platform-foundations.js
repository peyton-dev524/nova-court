/**
 * NOVA COURT platform foundations.
 *
 * Renderer-, DOM-, and storage-provider-agnostic contracts for statistics,
 * persistence, localization, responsive layout, graphics, loading, recovery,
 * and future online services. Nothing in this module claims that an online
 * service exists; callers must provide an explicit service adapter.
 */

export const PLATFORM_SCHEMA_VERSION = 3;
export const PLATFORM_STORAGE_KEYS = Object.freeze({
  primary: "nova-court-platform-v3",
  backup: "nova-court-platform-v3-backup",
  recovery: "nova-court-platform-v3-recovery",
});
export const MATCH_HISTORY_LIMIT = 200;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const integer = (value, fallback = 0) => Math.floor(finite(value, fallback));
const copy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const text = (value, maximum = 80) => String(value ?? "").normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maximum);
const plainObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

/** FNV-1a is an integrity checksum, not a security signature. */
export function checksumValue(value) {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export const SHOT_ZONES = Object.freeze([
  "restricted", "paint", "mid-left", "mid-center", "mid-right",
  "corner-3-left", "above-break-3", "corner-3-right",
]);

const emptyShotLine = () => ({ attempts: 0, made: 0, contestedAttempts: 0, contestedMade: 0 });

export function createAdvancedStats() {
  return {
    version: 1,
    points: 0,
    possessions: 0,
    assistsLeadingToScores: 0,
    turnoversForced: 0,
    defensiveStops: 0,
    paintPoints: 0,
    fastBreakPoints: 0,
    secondChancePoints: 0,
    releaseTimingTotalMs: 0,
    releaseTimingSamples: 0,
    opponentFieldGoalsMade: 0,
    opponentFieldGoalsAttempted: 0,
    shootingZones: Object.fromEntries(SHOT_ZONES.map((zone) => [zone, emptyShotLine()])),
  };
}

function normalizeShotLine(candidate) {
  const attempts = Math.max(0, integer(candidate?.attempts));
  const made = clamp(integer(candidate?.made), 0, attempts);
  const contestedAttempts = clamp(integer(candidate?.contestedAttempts), 0, attempts);
  return {
    attempts,
    made,
    contestedAttempts,
    contestedMade: clamp(integer(candidate?.contestedMade), 0, Math.min(made, contestedAttempts)),
  };
}

export function normalizeAdvancedStats(candidate) {
  const source = plainObject(candidate) ? candidate : {};
  const result = createAdvancedStats();
  for (const key of [
    "points", "possessions", "assistsLeadingToScores", "turnoversForced", "defensiveStops",
    "paintPoints", "fastBreakPoints", "secondChancePoints", "releaseTimingSamples",
    "opponentFieldGoalsMade", "opponentFieldGoalsAttempted",
  ]) result[key] = Math.max(0, integer(source[key]));
  result.opponentFieldGoalsMade = Math.min(result.opponentFieldGoalsMade, result.opponentFieldGoalsAttempted);
  result.releaseTimingTotalMs = Math.max(0, finite(source.releaseTimingTotalMs));
  result.shootingZones = Object.fromEntries(SHOT_ZONES.map((zone) => [
    zone,
    normalizeShotLine(source.shootingZones?.[zone]),
  ]));
  return result;
}

/** Record one authoritative gameplay event without mutating the prior snapshot. */
export function recordAdvancedStat(candidate, event = {}) {
  const stats = normalizeAdvancedStats(candidate);
  switch (event.type) {
    case "shot": {
      if (!SHOT_ZONES.includes(event.zone)) return { ok: false, reason: "invalid-shot-zone", stats };
      const line = stats.shootingZones[event.zone];
      const made = event.made === true;
      const contested = event.contested === true;
      line.attempts += 1;
      if (made) line.made += 1;
      if (contested) line.contestedAttempts += 1;
      if (made && contested) line.contestedMade += 1;
      if (made) stats.points += clamp(integer(event.points, 2), 1, 3);
      if (Number.isFinite(Number(event.releaseOffsetMs))) {
        stats.releaseTimingTotalMs += Math.abs(Number(event.releaseOffsetMs));
        stats.releaseTimingSamples += 1;
      }
      break;
    }
    case "possession": stats.possessions += 1; break;
    case "assist-score": stats.assistsLeadingToScores += 1; break;
    case "turnover-forced": stats.turnoversForced += 1; break;
    case "defensive-stop": stats.defensiveStops += 1; break;
    case "paint-points": stats.paintPoints += clamp(integer(event.points, 2), 0, 4); break;
    case "fast-break-points": stats.fastBreakPoints += clamp(integer(event.points, 2), 0, 4); break;
    case "second-chance-points": stats.secondChancePoints += clamp(integer(event.points, 2), 0, 4); break;
    case "opponent-shot": {
      stats.opponentFieldGoalsAttempted += 1;
      if (event.made === true) stats.opponentFieldGoalsMade += 1;
      break;
    }
    default: return { ok: false, reason: "unknown-stat-event", stats };
  }
  return { ok: true, stats };
}

const percentage = (made, attempts) => attempts > 0 ? made / attempts : null;

export function summarizeAdvancedStats(candidate) {
  const stats = normalizeAdvancedStats(candidate);
  const zoneTotals = Object.values(stats.shootingZones).reduce((total, line) => ({
    attempts: total.attempts + line.attempts,
    made: total.made + line.made,
    contestedAttempts: total.contestedAttempts + line.contestedAttempts,
    contestedMade: total.contestedMade + line.contestedMade,
  }), emptyShotLine());
  return {
    ...stats,
    fieldGoalPercentage: percentage(zoneTotals.made, zoneTotals.attempts),
    contestedFieldGoalPercentage: percentage(zoneTotals.contestedMade, zoneTotals.contestedAttempts),
    possessionEfficiency: stats.possessions > 0 ? stats.points / stats.possessions : null,
    averageReleaseTimingMs: stats.releaseTimingSamples > 0
      ? stats.releaseTimingTotalMs / stats.releaseTimingSamples
      : null,
    opponentFieldGoalPercentage: percentage(stats.opponentFieldGoalsMade, stats.opponentFieldGoalsAttempted),
  };
}

function normalizeScore(score) {
  return {
    player: clamp(integer(score?.player), 0, 999),
    opponent: clamp(integer(score?.opponent), 0, 999),
  };
}

export function createMatchRecord(candidate = {}) {
  const id = text(candidate.id, 96);
  const dateMs = Number(new Date(candidate.date ?? candidate.dateMs ?? Number.NaN));
  const venue = text(candidate.venue, 64);
  const mode = text(candidate.mode, 64);
  const opponent = text(candidate.opponent, 64);
  if (!id) return { ok: false, reason: "missing-match-id" };
  if (!Number.isFinite(dateMs)) return { ok: false, reason: "invalid-date" };
  if (!venue || !mode || !opponent) return { ok: false, reason: "missing-match-metadata" };
  const score = normalizeScore(candidate.score);
  const result = score.player === score.opponent ? "draw" : score.player > score.opponent ? "win" : "loss";
  return {
    ok: true,
    record: {
      id,
      dateMs,
      venue,
      mode,
      score,
      result,
      opponent,
      playerGrade: text(candidate.playerGrade || "—", 12),
      statistics: normalizeAdvancedStats(candidate.statistics),
      earnedXp: clamp(integer(candidate.earnedXp), 0, 1_000_000),
      earnedCredits: clamp(integer(candidate.earnedCredits), 0, 1_000_000),
      majorHighlights: Array.from(candidate.majorHighlights || []).slice(0, 20).map((highlight) => ({
        type: text(highlight?.type ?? highlight, 40),
        label: text(highlight?.label ?? highlight, 120),
        timeMs: Math.max(0, integer(highlight?.timeMs)),
      })).filter((highlight) => highlight.type || highlight.label),
    },
  };
}

export function addMatchRecord(history, candidate, limit = MATCH_HISTORY_LIMIT) {
  const created = createMatchRecord(candidate);
  const prior = Array.isArray(history) ? history : [];
  if (!created.ok) return { ...created, history: copy(prior) };
  if (prior.some((record) => record?.id === created.record.id)) {
    return { ok: false, reason: "duplicate-match", history: copy(prior) };
  }
  const next = [created.record, ...prior]
    .sort((a, b) => b.dateMs - a.dateMs || String(a.id).localeCompare(String(b.id)))
    .slice(0, clamp(integer(limit, MATCH_HISTORY_LIMIT), 1, 1000));
  return { ok: true, record: created.record, history: next };
}

export function filterMatchHistory(history, filters = {}) {
  const query = text(filters.opponent, 64).toLocaleLowerCase(filters.locale || undefined);
  const from = filters.from == null ? -Infinity : Number(new Date(filters.from));
  const to = filters.to == null ? Infinity : Number(new Date(filters.to));
  const selected = (Array.isArray(history) ? history : []).filter((record) =>
    (!filters.mode || record.mode === filters.mode) &&
    (!filters.venue || record.venue === filters.venue) &&
    (!filters.result || record.result === filters.result) &&
    (!query || String(record.opponent).toLocaleLowerCase(filters.locale || undefined).includes(query)) &&
    record.dateMs >= from && record.dateMs <= to
  );
  return selected.sort((a, b) => filters.order === "oldest"
    ? a.dateMs - b.dateMs || String(a.id).localeCompare(String(b.id))
    : b.dateMs - a.dateMs || String(a.id).localeCompare(String(b.id)));
}

export function createDefaultPlatformState(now = 0) {
  return {
    version: PLATFORM_SCHEMA_VERSION,
    revision: 0,
    updatedAt: Math.max(0, integer(now)),
    profile: null,
    settings: {},
    matchHistory: [],
    challengeProgress: {},
    venueUnlocks: [],
    controlBindings: {},
    lastUsedLoadout: null,
    progression: { credits: 0, xp: 0 },
    rewardLedger: [],
  };
}

function sanitizeDictionary(candidate, maximumKeys = 200) {
  if (!plainObject(candidate)) return {};
  return Object.fromEntries(Object.entries(candidate).slice(0, maximumKeys).map(([key, value]) => [text(key, 80), copy(value)]));
}

export function migratePlatformState(candidate, now = 0) {
  const warnings = [];
  const source = plainObject(candidate) ? copy(candidate) : {};
  const migratedFrom = clamp(integer(source.version, 1), 1, PLATFORM_SCHEMA_VERSION);
  if (!plainObject(candidate)) warnings.push("invalid-root-replaced");
  if (migratedFrom === 1) {
    source.matchHistory = source.matchHistory ?? source.history ?? [];
    source.rewardLedger = source.rewardLedger ?? source.rewardedMatches ?? [];
  }
  if (migratedFrom <= 2) {
    source.progression = source.progression ?? { credits: source.credits, xp: source.xp };
    source.controlBindings = source.controlBindings ?? source.controls ?? {};
  }
  const defaults = createDefaultPlatformState(now);
  const matchHistory = [];
  for (const candidateRecord of Array.isArray(source.matchHistory) ? source.matchHistory : []) {
    const record = createMatchRecord(candidateRecord);
    if (record.ok && !matchHistory.some((item) => item.id === record.record.id)) matchHistory.push(record.record);
    else warnings.push(`dropped-match:${text(candidateRecord?.id, 40) || "unknown"}`);
  }
  const rewardLedger = [...new Set((Array.isArray(source.rewardLedger) ? source.rewardLedger : [])
    .map((entry) => text(plainObject(entry) ? entry.id : entry, 96)).filter(Boolean))].slice(-1000);
  const state = {
    version: PLATFORM_SCHEMA_VERSION,
    revision: Math.max(0, integer(source.revision)),
    updatedAt: Math.max(0, integer(source.updatedAt, now)),
    profile: plainObject(source.profile) ? copy(source.profile) : null,
    settings: sanitizeDictionary(source.settings),
    matchHistory: matchHistory.sort((a, b) => b.dateMs - a.dateMs).slice(0, MATCH_HISTORY_LIMIT),
    challengeProgress: sanitizeDictionary(source.challengeProgress),
    venueUnlocks: [...new Set(Array.from(source.venueUnlocks || []).map((item) => text(item, 64)).filter(Boolean))],
    controlBindings: sanitizeDictionary(source.controlBindings),
    lastUsedLoadout: plainObject(source.lastUsedLoadout) ? copy(source.lastUsedLoadout) : null,
    progression: {
      credits: clamp(integer(source.progression?.credits), 0, 1_000_000_000),
      xp: clamp(integer(source.progression?.xp), 0, 1_000_000_000),
    },
    rewardLedger,
  };
  return { state, migratedFrom, migrated: migratedFrom !== PLATFORM_SCHEMA_VERSION, warnings, defaults };
}

export function validatePlatformState(candidate) {
  const errors = [];
  if (!plainObject(candidate)) errors.push("state must be an object");
  if (candidate?.version !== PLATFORM_SCHEMA_VERSION) errors.push("unsupported state version");
  if (!Number.isInteger(candidate?.revision) || candidate.revision < 0) errors.push("invalid revision");
  if (!Array.isArray(candidate?.matchHistory)) errors.push("matchHistory must be an array");
  if (!Array.isArray(candidate?.rewardLedger)) errors.push("rewardLedger must be an array");
  if (!plainObject(candidate?.settings)) errors.push("settings must be an object");
  return { valid: errors.length === 0, errors };
}

export function createSaveEnvelope(candidate) {
  const state = migratePlatformState(candidate).state;
  return { format: "nova-court-save", envelopeVersion: 1, checksum: checksumValue(state), state };
}

export function parseSaveEnvelope(raw) {
  try {
    const envelope = typeof raw === "string" ? JSON.parse(raw) : copy(raw);
    if (!plainObject(envelope) || envelope.format !== "nova-court-save" || envelope.envelopeVersion !== 1) {
      return { ok: false, reason: "invalid-envelope" };
    }
    if (checksumValue(envelope.state) !== envelope.checksum) return { ok: false, reason: "checksum-mismatch" };
    const migrated = migratePlatformState(envelope.state);
    const validation = validatePlatformState(migrated.state);
    return validation.valid ? { ok: true, ...migrated } : { ok: false, reason: "validation-failed", errors: validation.errors };
  } catch (error) {
    return { ok: false, reason: "invalid-json", message: error?.message || String(error) };
  }
}

function storageRequired(storage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new TypeError("A storage adapter with getItem/setItem is required.");
  }
}

export function savePlatformState(storage, candidate, options = {}) {
  storageRequired(storage);
  const keys = options.keys || PLATFORM_STORAGE_KEYS;
  const migrated = migratePlatformState(candidate, options.now).state;
  const state = { ...migrated, version: PLATFORM_SCHEMA_VERSION, revision: migrated.revision + 1, updatedAt: Math.max(0, integer(options.now, Date.now())) };
  const serialized = JSON.stringify(createSaveEnvelope(state));
  try {
    storage.setItem(keys.recovery, serialized);
    const prior = storage.getItem(keys.primary);
    if (prior != null && parseSaveEnvelope(prior).ok) storage.setItem(keys.backup, prior);
    storage.setItem(keys.primary, serialized);
    const verification = parseSaveEnvelope(storage.getItem(keys.primary));
    if (!verification.ok || verification.state.revision !== state.revision) throw new Error("Save verification failed.");
    storage.removeItem?.(keys.recovery);
    return { ok: true, state, backupCreated: prior != null && parseSaveEnvelope(prior).ok };
  } catch (error) {
    return { ok: false, reason: "storage-write-failed", message: error?.message || String(error), state };
  }
}

export function loadPlatformState(storage, options = {}) {
  storageRequired(storage);
  const keys = options.keys || PLATFORM_STORAGE_KEYS;
  const candidates = ["primary", "recovery", "backup"].map((source) => ({
    source,
    parsed: parseSaveEnvelope(storage.getItem(keys[source])),
  }));
  const valid = candidates.filter((candidate) => candidate.parsed.ok).sort((a, b) =>
    b.parsed.state.revision - a.parsed.state.revision ||
    b.parsed.state.updatedAt - a.parsed.state.updatedAt ||
    ["primary", "recovery", "backup"].indexOf(a.source) - ["primary", "recovery", "backup"].indexOf(b.source)
  );
  if (!valid.length) {
    return {
      ok: true,
      state: createDefaultPlatformState(options.now),
      source: "default",
      recovered: false,
      warnings: candidates.filter((item) => item.parsed.reason !== "invalid-envelope").map((item) => `${item.source}:${item.parsed.reason}`),
    };
  }
  const selected = valid[0];
  return {
    ok: true,
    state: selected.parsed.state,
    source: selected.source,
    recovered: selected.source !== "primary",
    warnings: candidates.filter((item) => !item.parsed.ok && storage.getItem(keys[item.source]) != null)
      .map((item) => `${item.source}:${item.parsed.reason}`),
  };
}

export function applyRewardReceipt(candidate, receipt = {}) {
  const state = migratePlatformState(candidate).state;
  const id = text(receipt.id ?? receipt.matchId, 96);
  if (!id) return { ok: false, reason: "missing-reward-id", state };
  if (state.rewardLedger.includes(id)) return { ok: false, reason: "already-rewarded", state };
  const credits = clamp(integer(receipt.credits), 0, 1_000_000);
  const xp = clamp(integer(receipt.xp), 0, 1_000_000);
  state.progression.credits = clamp(state.progression.credits + credits, 0, 1_000_000_000);
  state.progression.xp = clamp(state.progression.xp + xp, 0, 1_000_000_000);
  state.rewardLedger = [...state.rewardLedger, id].slice(-1000);
  return { ok: true, credits, xp, state };
}

export const SUPPORTED_LOCALES = Object.freeze(["en-US", "en-GB", "es-ES", "fr-FR", "de-DE", "ar", "he"]);
const RTL_LANGUAGES = new Set(["ar", "fa", "he", "ur"]);

export function resolveLocaleSettings(options = {}) {
  const requested = text(options.locale || "en-US", 35);
  let supported = "en-US";
  try {
    supported = Intl.NumberFormat.supportedLocalesOf([requested])[0] || "en-US";
  } catch {
    supported = "en-US";
  }
  const language = new Intl.Locale(supported).language;
  return {
    locale: supported,
    language,
    direction: RTL_LANGUAGES.has(language) ? "rtl" : "ltr",
    measurementSystem: options.measurementSystem === "metric" || options.measurementSystem === "imperial"
      ? options.measurementSystem
      : supported === "en-US" ? "imperial" : "metric",
    subtitleLanguage: text(options.subtitleLanguage || language, 35),
    commentaryLanguage: options.availableCommentary?.includes(options.commentaryLanguage)
      ? options.commentaryLanguage
      : options.availableCommentary?.includes(language) ? language : "en",
  };
}

export function formatLocalizedNumber(value, locale = "en-US", options = {}) {
  return new Intl.NumberFormat(resolveLocaleSettings({ locale }).locale, options).format(finite(value));
}

export function formatLocalizedDate(value, locale = "en-US", options = {}) {
  const date = new Date(value);
  if (!Number.isFinite(Number(date))) return "—";
  return new Intl.DateTimeFormat(resolveLocaleSettings({ locale }).locale, {
    year: "numeric", month: "short", day: "numeric", ...options,
  }).format(date);
}

export function formatHeight(heightM, locale = "en-US", system) {
  const settings = resolveLocaleSettings({ locale, measurementSystem: system });
  const meters = clamp(finite(heightM, 1.9), 1, 3);
  if (settings.measurementSystem === "metric") {
    return `${formatLocalizedNumber(meters, settings.locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
  }
  const totalInches = Math.round(meters / 0.0254);
  return `${Math.floor(totalInches / 12)}′ ${totalInches % 12}″`;
}

export function createTranslator(catalogs = {}, options = {}) {
  const settings = resolveLocaleSettings(options);
  const fallbackLocale = options.fallbackLocale || "en-US";
  return Object.freeze({
    ...settings,
    t(key, variables = {}) {
      const template = catalogs[settings.locale]?.[key] ?? catalogs[settings.language]?.[key]
        ?? catalogs[fallbackLocale]?.[key] ?? key;
      return String(template).replace(/\{([\w.-]+)\}/g, (_, name) => variables[name] == null ? `{${name}}` : String(variables[name]));
    },
  });
}

export function computeResponsiveLayout(options = {}) {
  const width = Math.max(320, finite(options.width, 1280));
  const height = Math.max(240, finite(options.height, 720));
  const overscan = clamp(finite(options.overscan, 0.035), 0, 0.1);
  const safe = plainObject(options.safeArea) ? options.safeArea : {};
  const baseX = width * overscan;
  const baseY = height * overscan;
  const inset = {
    top: Math.max(baseY, finite(safe.top)),
    right: Math.max(baseX, finite(safe.right)),
    bottom: Math.max(baseY, finite(safe.bottom)),
    left: Math.max(baseX, finite(safe.left)),
  };
  const aspect = width / height;
  const ultrawide = aspect >= 2;
  const contentWidth = ultrawide ? Math.min(width - inset.left - inset.right, height * 2) : width - inset.left - inset.right;
  const contentLeft = (width - contentWidth) / 2;
  const hudScale = clamp(finite(options.hudScale, 1), 0.75, 1.5);
  const menuScale = clamp(finite(options.menuScale, 1), 0.8, 1.4);
  return {
    width, height, aspect, ultrawide,
    sizeClass: width < 1024 || height < 600 ? "compact" : width >= 2560 ? "large" : "standard",
    inset,
    contentRect: { left: contentLeft, top: inset.top, width: contentWidth, height: height - inset.top - inset.bottom },
    hudScale,
    menuScale,
    cssVariables: {
      "--safe-top": `${Math.round(inset.top)}px`, "--safe-right": `${Math.round(inset.right)}px`,
      "--safe-bottom": `${Math.round(inset.bottom)}px`, "--safe-left": `${Math.round(inset.left)}px`,
      "--hud-scale": String(hudScale), "--menu-scale": String(menuScale),
      "--content-max-width": `${Math.round(contentWidth)}px`,
    },
  };
}

export const GRAPHICS_DIMENSIONS = Object.freeze([
  "models", "textures", "shadows", "reflections", "crowds", "lighting", "effects",
  "antiAliasing", "renderDistance", "resolutionScale",
]);

export const GRAPHICS_PRESETS = Object.freeze({
  low: Object.freeze({ models: "low", textures: "low", shadows: "off", reflections: "off", crowds: 0.35, lighting: "basic", effects: 0.45, antiAliasing: "fxaa", renderDistance: 0.65, resolutionScale: 0.75 }),
  medium: Object.freeze({ models: "medium", textures: "medium", shadows: "medium", reflections: "static", crowds: 0.7, lighting: "standard", effects: 0.75, antiAliasing: "fxaa", renderDistance: 0.85, resolutionScale: 0.9 }),
  high: Object.freeze({ models: "high", textures: "high", shadows: "high", reflections: "dynamic", crowds: 1, lighting: "enhanced", effects: 1, antiAliasing: "msaa", renderDistance: 1, resolutionScale: 1 }),
});

export function resolveGraphicsSettings(preset = "medium", overrides = {}) {
  const tier = GRAPHICS_PRESETS[preset] ? preset : "medium";
  const base = GRAPHICS_PRESETS[tier];
  const settings = { ...base };
  for (const key of GRAPHICS_DIMENSIONS) if (overrides[key] != null) settings[key] = overrides[key];
  settings.crowds = clamp(finite(settings.crowds, base.crowds), 0, 1);
  settings.effects = clamp(finite(settings.effects, base.effects), 0.25, 1);
  settings.renderDistance = clamp(finite(settings.renderDistance, base.renderDistance), 0.5, 1);
  settings.resolutionScale = clamp(finite(settings.resolutionScale, base.resolutionScale), 0.5, 1);
  return { preset: tier, ...settings, gameplayReadability: { courtLines: true, ballContrast: true, playerIndicators: true, shotFeedback: true } };
}

export function createAssetPreloadPlan(assets, options = {}) {
  const budgetBytes = Math.max(0, integer(options.budgetBytes, 32 * 1024 * 1024));
  const unique = new Map();
  for (const asset of Array.from(assets || [])) {
    const id = text(asset?.id, 96);
    if (!id || unique.has(id)) continue;
    unique.set(id, { id, type: text(asset.type || "other", 40), bytes: Math.max(0, integer(asset.bytes)), required: asset.required === true, priority: integer(asset.priority), source: asset.source });
  }
  const ordered = [...unique.values()].sort((a, b) => Number(b.required) - Number(a.required) || b.priority - a.priority || a.id.localeCompare(b.id));
  const selected = [];
  const deferred = [];
  let selectedBytes = 0;
  for (const asset of ordered) {
    if (asset.required || selectedBytes + asset.bytes <= budgetBytes) {
      selected.push(asset);
      selectedBytes += asset.bytes;
    } else deferred.push(asset);
  }
  return { budgetBytes, selectedBytes, overBudgetBytes: Math.max(0, selectedBytes - budgetBytes), selected, deferred, requiredReady: false };
}

/**
 * Sequential by design: deterministic ordering, cancellation, and progress are
 * more important during menu preloads than maximizing network concurrency.
 */
export function createPreloadCoordinator(options = {}) {
  if (typeof options.load !== "function") throw new TypeError("Preload coordinator requires a load(asset, context) function.");
  const cacheBudgetBytes = Math.max(0, integer(options.cacheBudgetBytes, 64 * 1024 * 1024));
  const cache = new Map();
  let generation = 0;
  let usedBytes = 0;

  function evict(bytesNeeded) {
    for (const [id, entry] of cache) {
      if (usedBytes + bytesNeeded <= cacheBudgetBytes) break;
      if (entry.pinned) continue;
      options.dispose?.(entry.value, entry.asset);
      cache.delete(id);
      usedBytes -= entry.asset.bytes;
    }
  }

  async function preload(assets, preloadOptions = {}) {
    const token = ++generation;
    const plan = createAssetPreloadPlan(assets, preloadOptions);
    const failures = [];
    const loaded = [];
    let completedBytes = 0;
    for (const asset of plan.selected) {
      if (token !== generation || preloadOptions.signal?.aborted) return { ok: false, cancelled: true, token, loaded, failures, plan };
      if (cache.has(asset.id)) {
        const entry = cache.get(asset.id);
        cache.delete(asset.id);
        cache.set(asset.id, entry);
        loaded.push(asset.id);
      } else {
        try {
          const value = await options.load(asset, { signal: preloadOptions.signal, token });
          if (token !== generation || preloadOptions.signal?.aborted) {
            options.dispose?.(value, asset);
            return { ok: false, cancelled: true, token, loaded, failures, plan };
          }
          if (asset.bytes <= cacheBudgetBytes) {
            evict(asset.bytes);
            cache.set(asset.id, { asset, value, pinned: asset.required });
            usedBytes += asset.bytes;
          }
          loaded.push(asset.id);
        } catch (error) {
          failures.push({ id: asset.id, required: asset.required, message: error?.message || String(error) });
          if (asset.required) break;
        }
      }
      completedBytes += asset.bytes;
      options.onProgress?.({ token, assetId: asset.id, completed: loaded.length + failures.length, total: plan.selected.length, ratio: plan.selectedBytes ? Math.min(1, completedBytes / plan.selectedBytes) : 1 });
    }
    const requiredFailures = failures.filter((failure) => failure.required);
    return { ok: requiredFailures.length === 0, cancelled: false, token, loaded, failures, plan: { ...plan, requiredReady: requiredFailures.length === 0 } };
  }

  return Object.freeze({
    preload,
    cancel() { generation += 1; },
    has(id) { return cache.has(id); },
    get(id) { return cache.get(id)?.value; },
    release(id) {
      const entry = cache.get(id);
      if (!entry) return false;
      options.dispose?.(entry.value, entry.asset);
      cache.delete(id);
      usedBytes -= entry.asset.bytes;
      return true;
    },
    snapshot() { return { generation, usedBytes, cacheBudgetBytes, ids: [...cache.keys()] }; },
  });
}

export const RECOVERY_POLICIES = Object.freeze({
  "venue-asset": Object.freeze({ severity: "degraded", retryable: true, fallback: "code-native-venue", safeDestination: "venue-select" }),
  "model-load": Object.freeze({ severity: "degraded", retryable: true, fallback: "default-player-model", safeDestination: "my-player" }),
  save: Object.freeze({ severity: "blocking", retryable: true, fallback: "load-backup", safeDestination: "main-menu" }),
  controller: Object.freeze({ severity: "paused", retryable: true, fallback: "keyboard-or-reconnect", safeDestination: "pause-menu" }),
  resize: Object.freeze({ severity: "recoverable", retryable: false, fallback: "recompute-layout", safeDestination: "current" }),
  focus: Object.freeze({ severity: "paused", retryable: false, fallback: "pause-and-clear-input", safeDestination: "pause-menu" }),
  audio: Object.freeze({ severity: "degraded", retryable: true, fallback: "silent-mode-captions", safeDestination: "current" }),
  webgl: Object.freeze({ severity: "blocking", retryable: true, fallback: "restore-context-or-menu", safeDestination: "main-menu" }),
  network: Object.freeze({ severity: "paused", retryable: true, fallback: "cancel-without-penalty", safeDestination: "online-menu" }),
  customization: Object.freeze({ severity: "recoverable", retryable: false, fallback: "validated-defaults", safeDestination: "my-player" }),
  unknown: Object.freeze({ severity: "blocking", retryable: true, fallback: "safe-menu", safeDestination: "main-menu" }),
});

export function resolveRecoveryAction(kind, details = {}) {
  const type = RECOVERY_POLICIES[kind] ? kind : "unknown";
  const policy = RECOVERY_POLICIES[type];
  return {
    kind: type,
    ...policy,
    code: text(details.code || `${type}-failure`, 64),
    message: text(details.message || "NOVA COURT recovered from an unexpected problem.", 240),
    preserveProgress: type !== "save",
    clearHeldInput: type === "focus" || type === "controller",
    preventInteraction: policy.severity === "blocking" || policy.severity === "paused",
  };
}

export function createRecoveryManager(options = {}) {
  const incidents = [];
  return Object.freeze({
    report(kind, details) {
      const action = resolveRecoveryAction(kind, details);
      const incident = { id: `incident-${incidents.length + 1}`, at: Math.max(0, integer(details?.at, Date.now())), action };
      incidents.push(incident);
      options.onAction?.(incident);
      return incident;
    },
    snapshot() { return { incidents: copy(incidents), latest: copy(incidents.at(-1) || null) }; },
    clear() { incidents.length = 0; },
  });
}

export function normalizeCustomization(candidate, schema = {}) {
  const source = plainObject(candidate) ? candidate : {};
  const value = {};
  const corrections = [];
  for (const [key, rule] of Object.entries(schema)) {
    let next = source[key] ?? rule.default;
    if (Array.isArray(rule.allowed) && !rule.allowed.includes(next)) next = rule.default;
    if (rule.type === "number") next = clamp(finite(next, rule.default), finite(rule.min, -Infinity), finite(rule.max, Infinity));
    if (rule.type === "string") next = text(next, rule.maxLength || 80) || rule.default;
    value[key] = next;
    if (next !== source[key]) corrections.push(key);
  }
  return { value, corrected: corrections.length > 0, corrections };
}

export const ONLINE_FEATURE_CONTRACTS = Object.freeze({
  leaderboards: Object.freeze({ available: false, requires: ["authenticated-account", "authoritative-score-service"], scopes: ["friends", "regional", "global"] }),
  matchmaking: Object.freeze({ available: false, requires: ["authenticated-account", "regional-matchmaker", "connection-probe"] }),
  synchronization: Object.freeze({ available: false, requires: ["authoritative-game-server", "prediction-reconciliation"] }),
  crews: Object.freeze({ available: false, requires: ["authenticated-account", "moderation", "reporting"] }),
  spectator: Object.freeze({ available: false, requires: ["authoritative-game-server", "spectator-delay", "privacy-filter"] }),
  competitiveIntegrity: Object.freeze({ available: false, requires: ["server-validation", "replay-audit", "appeals", "failure-attribution"] }),
});

export function createOnlineServiceGateway(adapter) {
  const capabilities = Object.fromEntries(Object.entries(ONLINE_FEATURE_CONTRACTS).map(([feature, contract]) => [
    feature,
    Boolean(adapter?.capabilities?.[feature] === true && typeof adapter.request === "function"),
  ]));
  return Object.freeze({
    capabilities,
    status(feature) {
      const contract = ONLINE_FEATURE_CONTRACTS[feature];
      if (!contract) return { available: false, reason: "unknown-feature" };
      return capabilities[feature]
        ? { ...contract, available: true, reason: "adapter-ready" }
        : { ...contract, available: false, reason: "service-unavailable" };
    },
    async request(feature, payload) {
      if (!capabilities[feature]) return { ok: false, unavailable: true, reason: "service-unavailable" };
      try { return await adapter.request(feature, copy(payload)); }
      catch (error) { return { ok: false, unavailable: false, reason: "service-error", message: error?.message || String(error) }; }
    },
  });
}

/** Client-side preflight only. Competitive authority must repeat validation server-side. */
export function validateCompetitiveAction(action, context = {}) {
  const reasons = [];
  const allowedTypes = new Set(context.allowedTypes || ["move", "shot", "pass", "steal", "block", "pause"]);
  if (!plainObject(action)) return { valid: false, reasons: ["invalid-payload"] };
  if (!allowedTypes.has(action.type)) reasons.push("invalid-action-type");
  if (!text(action.playerId, 96) || (context.playerId && action.playerId !== context.playerId)) reasons.push("invalid-player");
  if (!Number.isInteger(action.sequence) || action.sequence <= integer(context.lastSequence, -1)) reasons.push("stale-sequence");
  if (!Number.isFinite(action.clientTimeMs) || Math.abs(action.clientTimeMs - finite(context.serverTimeMs, action.clientTimeMs)) > finite(context.maxClockSkewMs, 5000)) reasons.push("invalid-timestamp");
  if (action.position) {
    for (const axis of ["x", "y", "z"]) if (!Number.isFinite(action.position[axis])) reasons.push(`invalid-position-${axis}`);
  }
  if (Number.isFinite(action.speed) && (action.speed < 0 || action.speed > finite(context.maxSpeed, 12))) reasons.push("impossible-speed");
  if (action.ratings && Object.values(action.ratings).some((rating) => !Number.isFinite(rating) || rating < 25 || rating > 99)) reasons.push("modified-rating");
  return { valid: reasons.length === 0, reasons: [...new Set(reasons)], sanitized: reasons.length ? null : copy(action), authority: "server-must-verify" };
}
