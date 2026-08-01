import test from "node:test";
import assert from "node:assert/strict";

import {
  GRAPHICS_PRESETS,
  MATCH_HISTORY_LIMIT,
  ONLINE_FEATURE_CONTRACTS,
  PLATFORM_SCHEMA_VERSION,
  PLATFORM_STORAGE_KEYS,
  SHOT_ZONES,
  addMatchRecord,
  applyRewardReceipt,
  checksumValue,
  computeResponsiveLayout,
  createAdvancedStats,
  createAssetPreloadPlan,
  createDefaultPlatformState,
  createMatchRecord,
  createOnlineServiceGateway,
  createPreloadCoordinator,
  createRecoveryManager,
  createSaveEnvelope,
  createTranslator,
  filterMatchHistory,
  formatHeight,
  formatLocalizedDate,
  loadPlatformState,
  migratePlatformState,
  normalizeCustomization,
  parseSaveEnvelope,
  recordAdvancedStat,
  resolveGraphicsSettings,
  resolveLocaleSettings,
  resolveRecoveryAction,
  savePlatformState,
  stableStringify,
  summarizeAdvancedStats,
  validateCompetitiveAction,
  validatePlatformState,
} from "../js/platform-foundations.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function record(id, date, overrides = {}) {
  return {
    id, date, venue: "Nova Park", mode: "Park Duel", opponent: "Rook",
    score: { player: 11, opponent: 7 }, ...overrides,
  };
}

test("advanced statistics track zone, contested, timing, efficiency, and opponent shooting", () => {
  let stats = createAdvancedStats();
  for (const event of [
    { type: "shot", zone: "paint", made: true, contested: true, points: 2, releaseOffsetMs: -24 },
    { type: "shot", zone: "above-break-3", made: false, contested: true, releaseOffsetMs: 36 },
    { type: "possession" }, { type: "possession" }, { type: "assist-score" },
    { type: "turnover-forced" }, { type: "defensive-stop" },
    { type: "paint-points", points: 2 }, { type: "fast-break-points", points: 2 },
    { type: "second-chance-points", points: 2 }, { type: "opponent-shot", made: true },
    { type: "opponent-shot", made: false },
  ]) stats = recordAdvancedStat(stats, event).stats;
  const summary = summarizeAdvancedStats(stats);
  assert.equal(summary.shootingZones.paint.made, 1);
  assert.equal(summary.fieldGoalPercentage, 0.5);
  assert.equal(summary.contestedFieldGoalPercentage, 0.5);
  assert.equal(summary.possessionEfficiency, 1);
  assert.equal(summary.averageReleaseTimingMs, 30);
  assert.equal(summary.opponentFieldGoalPercentage, 0.5);
  assert.deepEqual(Object.keys(summary.shootingZones), [...SHOT_ZONES]);
});

test("unknown stat events and zones fail without mutating the prior object", () => {
  const stats = createAdvancedStats();
  assert.equal(recordAdvancedStat(stats, { type: "shot", zone: "logo" }).reason, "invalid-shot-zone");
  assert.equal(recordAdvancedStat(stats, { type: "mystery" }).reason, "unknown-stat-event");
  assert.deepEqual(stats, createAdvancedStats());
});

test("match records derive results, normalize rewards, and reject malformed metadata", () => {
  const created = createMatchRecord(record("m-1", "2026-08-01T12:00:00Z", { earnedXp: 17.9 }));
  assert.equal(created.ok, true);
  assert.equal(created.record.result, "win");
  assert.equal(created.record.earnedXp, 17);
  assert.equal(createMatchRecord({}).reason, "missing-match-id");
  assert.equal(createMatchRecord(record("bad", "not-a-date")).reason, "invalid-date");
});

test("match history is bounded, duplicate-safe, stable, and filterable by all required fields", () => {
  let history = [];
  history = addMatchRecord(history, record("old", "2026-07-01", { venue: "Eclipse Arena", mode: "NOVA Five", opponent: "Comets", score: { player: 70, opponent: 72 } })).history;
  history = addMatchRecord(history, record("new", "2026-08-01")).history;
  assert.deepEqual(history.map((item) => item.id), ["new", "old"]);
  assert.equal(addMatchRecord(history, record("new", "2026-08-02")).reason, "duplicate-match");
  assert.equal(filterMatchHistory(history, { mode: "NOVA Five", venue: "Eclipse Arena", result: "loss", opponent: "com" })[0].id, "old");
  const oversized = Array.from({ length: MATCH_HISTORY_LIMIT + 5 }, (_, i) => record(`id-${i}`, `2025-01-${String((i % 28) + 1).padStart(2, "0")}`));
  let bounded = [];
  for (const item of oversized) bounded = addMatchRecord(bounded, item).history;
  assert.equal(bounded.length, MATCH_HISTORY_LIMIT);
});

test("legacy platform states migrate, clamp unsafe values, and validate current schema", () => {
  const migrated = migratePlatformState({ version: 1, credits: -20, xp: 12, history: [record("legacy", "2026-01-01")], rewardedMatches: ["r-1", "r-1"], controls: { shoot: "K" } });
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.version, PLATFORM_SCHEMA_VERSION);
  assert.equal(migrated.state.progression.credits, 0);
  assert.deepEqual(migrated.state.rewardLedger, ["r-1"]);
  assert.equal(migrated.state.controlBindings.shoot, "K");
  assert.equal(validatePlatformState(migrated.state).valid, true);
  assert.equal(validatePlatformState({}).valid, false);
});

test("stable serialization and checksum ignore object insertion order but detect corruption", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
  assert.equal(checksumValue({ b: 2, a: 1 }), checksumValue({ a: 1, b: 2 }));
  const envelope = createSaveEnvelope(createDefaultPlatformState());
  envelope.state.revision = 12;
  assert.equal(parseSaveEnvelope(envelope).reason, "checksum-mismatch");
});

test("save rotates a verified primary backup and clears recovery journal", () => {
  const storage = memoryStorage();
  const first = savePlatformState(storage, createDefaultPlatformState(), { now: 100 });
  assert.equal(first.ok, true);
  const second = savePlatformState(storage, first.state, { now: 200 });
  assert.equal(second.ok, true);
  assert.equal(second.backupCreated, true);
  assert.equal(storage.getItem(PLATFORM_STORAGE_KEYS.recovery), null);
  assert.equal(parseSaveEnvelope(storage.getItem(PLATFORM_STORAGE_KEYS.primary)).state.revision, 2);
  assert.equal(parseSaveEnvelope(storage.getItem(PLATFORM_STORAGE_KEYS.backup)).state.revision, 1);
});

test("load selects the newest valid envelope and reports backup recovery", () => {
  const storage = memoryStorage();
  const state = { ...createDefaultPlatformState(20), revision: 4 };
  storage.setItem(PLATFORM_STORAGE_KEYS.primary, "{broken");
  storage.setItem(PLATFORM_STORAGE_KEYS.backup, JSON.stringify(createSaveEnvelope(state)));
  const loaded = loadPlatformState(storage);
  assert.equal(loaded.source, "backup");
  assert.equal(loaded.recovered, true);
  assert.equal(loaded.state.revision, 4);
  assert.match(loaded.warnings[0], /primary:invalid-json/);
});

test("save failure is returned clearly and leaves a recoverable state result", () => {
  const storage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
  const result = savePlatformState(storage, createDefaultPlatformState(), { now: 3 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "storage-write-failed");
  assert.match(result.message, /quota/);
});

test("reward receipts are idempotent and cannot create negative or unbounded payouts", () => {
  const state = createDefaultPlatformState();
  const first = applyRewardReceipt(state, { matchId: "match-9", credits: 25, xp: 50 });
  assert.equal(first.ok, true);
  assert.deepEqual(first.state.progression, { credits: 25, xp: 50 });
  const duplicate = applyRewardReceipt(first.state, { matchId: "match-9", credits: 999, xp: 999 });
  assert.equal(duplicate.reason, "already-rewarded");
  assert.deepEqual(duplicate.state.progression, { credits: 25, xp: 50 });
});

test("localization resolves RTL, localized dates and metric/imperial heights", () => {
  assert.equal(resolveLocaleSettings({ locale: "ar" }).direction, "rtl");
  assert.equal(resolveLocaleSettings({ locale: "en-US" }).measurementSystem, "imperial");
  assert.match(formatHeight(1.905, "en-US"), /^6′ 3″$/);
  assert.match(formatHeight(1.905, "fr-FR", "metric"), /1[,.]91 m/);
  assert.notEqual(formatLocalizedDate("2026-08-01T12:00:00Z", "en-US", { timeZone: "UTC" }), "—");
});

test("translator uses locale, language, fallback, and preserves missing variables", () => {
  const translator = createTranslator({ "en-US": { greeting: "Hello {name}", fallback: "Ready" }, ar: { greeting: "مرحبًا {name}" } }, { locale: "ar" });
  assert.equal(translator.direction, "rtl");
  assert.equal(translator.t("greeting", { name: "Nova" }), "مرحبًا Nova");
  assert.equal(translator.t("fallback"), "Ready");
  assert.equal(translator.t("missing"), "missing");
});

test("responsive layout protects overscan, separates scales, and centers ultrawide HUD content", () => {
  const layout = computeResponsiveLayout({ width: 3440, height: 1440, safeArea: { bottom: 80 }, hudScale: 2, menuScale: 0.5 });
  assert.equal(layout.ultrawide, true);
  assert.ok(layout.contentRect.left > layout.inset.left);
  assert.equal(layout.inset.bottom, 80);
  assert.equal(layout.hudScale, 1.5);
  assert.equal(layout.menuScale, 0.8);
  assert.match(layout.cssVariables["--safe-left"], /px$/);
  const laptop = computeResponsiveLayout({ width: 1024, height: 576 });
  assert.equal(laptop.sizeClass, "compact");
});

test("graphics expose every requested dimension and low settings preserve gameplay readability", () => {
  assert.deepEqual(Object.keys(GRAPHICS_PRESETS), ["low", "medium", "high"]);
  const low = resolveGraphicsSettings("low", { effects: 0, resolutionScale: 0.1 });
  assert.equal(low.effects, 0.25);
  assert.equal(low.resolutionScale, 0.5);
  assert.deepEqual(low.gameplayReadability, { courtLines: true, ballContrast: true, playerIndicators: true, shotFeedback: true });
  assert.equal(resolveGraphicsSettings("unknown").preset, "medium");
});

test("preload planning always admits required assets and defers optional assets by deterministic priority", () => {
  const plan = createAssetPreloadPlan([
    { id: "uniform", bytes: 40, priority: 1 }, { id: "venue", bytes: 80, required: true },
    { id: "ball", bytes: 30, priority: 4 }, { id: "ball", bytes: 30, priority: 99 },
  ], { budgetBytes: 100 });
  assert.deepEqual(plan.selected.map((asset) => asset.id), ["venue"]);
  assert.deepEqual(plan.deferred.map((asset) => asset.id), ["ball", "uniform"]);
  assert.equal(plan.overBudgetBytes, 0);
});

test("preload coordinator caches, reports required failure, respects budget, and disposes stale completion", async () => {
  const disposed = [];
  const coordinator = createPreloadCoordinator({
    cacheBudgetBytes: 100,
    load: async (asset) => {
      if (asset.id === "missing") throw new Error("404");
      return { id: asset.id };
    },
    dispose: (value) => disposed.push(value.id),
  });
  const loaded = await coordinator.preload([{ id: "venue", bytes: 70, required: true }, { id: "ball", bytes: 30 }], { budgetBytes: 100 });
  assert.equal(loaded.ok, true);
  assert.deepEqual(coordinator.snapshot().ids, ["venue", "ball"]);
  assert.equal(coordinator.release("ball"), true);
  assert.deepEqual(disposed, ["ball"]);
  const failed = await coordinator.preload([{ id: "missing", bytes: 1, required: true }]);
  assert.equal(failed.ok, false);
  assert.equal(failed.plan.requiredReady, false);
});

test("recovery maps every failure family to a nonblank safe destination and records incidents", () => {
  for (const kind of ["venue-asset", "model-load", "save", "controller", "resize", "focus", "audio", "webgl", "network", "customization"]) {
    const action = resolveRecoveryAction(kind);
    assert.ok(action.safeDestination);
    assert.ok(action.fallback);
  }
  const manager = createRecoveryManager();
  const incident = manager.report("focus", { at: 10, message: "Window blurred" });
  assert.equal(incident.action.clearHeldInput, true);
  assert.equal(manager.snapshot().latest.id, "incident-1");
  manager.clear();
  assert.equal(manager.snapshot().incidents.length, 0);
});

test("invalid customization is corrected against explicit allowlists and ranges", () => {
  const normalized = normalizeCustomization({ hair: "exploit", height: 9, name: "" }, {
    hair: { allowed: ["crop", "fade"], default: "crop" },
    height: { type: "number", min: 1.7, max: 2.2, default: 1.9 },
    name: { type: "string", maxLength: 12, default: "Ace Nova" },
  });
  assert.deepEqual(normalized.value, { hair: "crop", height: 2.2, name: "Ace Nova" });
  assert.equal(normalized.corrected, true);
});

test("online service contracts are honestly unavailable without a capable adapter", async () => {
  assert.equal(Object.values(ONLINE_FEATURE_CONTRACTS).every((contract) => contract.available === false), true);
  const offline = createOnlineServiceGateway();
  assert.equal(offline.status("matchmaking").available, false);
  assert.deepEqual(await offline.request("leaderboards", {}), { ok: false, unavailable: true, reason: "service-unavailable" });
  const online = createOnlineServiceGateway({ capabilities: { leaderboards: true }, request: async () => ({ ok: true, rows: [] }) });
  assert.equal(online.status("leaderboards").available, true);
  assert.deepEqual(await online.request("leaderboards", {}), { ok: true, rows: [] });
  assert.equal(online.status("synchronization").available, false);
});

test("competitive action preflight rejects spoofing, replay, impossible motion, and modified ratings", () => {
  const valid = validateCompetitiveAction({ type: "move", playerId: "p1", sequence: 8, clientTimeMs: 1000, position: { x: 1, y: 0, z: 2 }, speed: 8, ratings: { speed: 90 } }, { playerId: "p1", lastSequence: 7, serverTimeMs: 1001 });
  assert.equal(valid.valid, true);
  assert.equal(valid.authority, "server-must-verify");
  const invalid = validateCompetitiveAction({ type: "teleport", playerId: "p2", sequence: 7, clientTimeMs: 90000, position: { x: Infinity, y: 0, z: 0 }, speed: 50, ratings: { speed: 200 } }, { playerId: "p1", lastSequence: 7, serverTimeMs: 1000 });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.reasons.includes("invalid-action-type"));
  assert.ok(invalid.reasons.includes("invalid-player"));
  assert.ok(invalid.reasons.includes("stale-sequence"));
  assert.ok(invalid.reasons.includes("impossible-speed"));
  assert.ok(invalid.reasons.includes("modified-rating"));
});
