import test from "node:test";
import assert from "node:assert/strict";

import {
  ATTRIBUTE_GROUPS,
  AVATAR_APPEARANCES,
  COSMETIC_PALETTES,
  POSITION_PRESETS,
  PROFILE_STORAGE_KEY,
  PROFILE_SCHEMA_VERSION,
  WIN_CREDIT_BONUS,
  awardMatch,
  calculateOverall,
  createDefaultProfile,
  equipCosmetic,
  getEnginePlayerConfig,
  getAvailableTitles,
  getProfileSummary,
  getUpgradeCost,
  levelFromXp,
  loadProfile,
  normalizeProfile,
  purchaseCosmetic,
  saveProfile,
  selectPosition,
  selectTitle,
  updatePlayerIdentity,
  upgradeAttribute,
} from "../js/player-progression.js";

test("five independent position builds and six original palettes are available", () => {
  const profile = createDefaultProfile();
  assert.deepEqual(Object.keys(profile.builds), ["PG", "SG", "SF", "PF", "C"]);
  assert.equal(COSMETIC_PALETTES.length, 6);
  assert.equal(profile.cosmetics.equipped, "novaPulse");
  assert.equal(Object.values(ATTRIBUTE_GROUPS).flat().length, 19);
});

test("overall is weighted by position and cannot exceed 99", () => {
  const profile = createDefaultProfile();
  const pg = profile.builds.PG;
  const maxed = Object.fromEntries(Object.keys(pg.attributes).map((key) => [key, 500]));
  assert.equal(calculateOverall("PG", maxed), 99);
  assert.notEqual(calculateOverall("PG", pg.attributes), calculateOverall("C", pg.attributes));
});

test("normalization migrates a legacy single build and clamps corrupt values", () => {
  const migrated = normalizeProfile({
    version: 1,
    position: "SG",
    selectedPosition: "SG",
    credits: -500,
    attributes: { threePoint: 500, ballHandle: "bad" },
    games: 4,
    wins: 99,
    xp: 480,
    cosmetics: { owned: ["missing", "novaPulse", "novaPulse"], equipped: "missing" },
  });
  assert.equal(migrated.version, PROFILE_SCHEMA_VERSION);
  assert.equal(migrated.credits, 0);
  assert.equal(migrated.builds.SG.attributes.threePoint, POSITION_PRESETS.SG.caps.threePoint);
  assert.equal(migrated.builds.SG.wins, 4);
  assert.equal(migrated.cosmetics.equipped, "novaPulse");
});

test("storage load falls back safely and save uses the versioned key", () => {
  const writes = [];
  const brokenStorage = { getItem: () => "{not-json" };
  assert.equal(loadProfile(brokenStorage).selectedPosition, "PG");
  const storage = {
    getItem: () => null,
    setItem: (key, value) => writes.push([key, JSON.parse(value)]),
  };
  const saved = saveProfile(createDefaultProfile(), storage, 1234);
  assert.equal(writes[0][0], PROFILE_STORAGE_KEY);
  assert.equal(writes[0][1].updatedAt, 1234);
  assert.equal(saved.updatedAt, 1234);
});

test("position selection preserves upgrades on every independent build", () => {
  let profile = createDefaultProfile();
  profile.credits = 10000;
  profile = upgradeAttribute(profile, "ballHandle").profile;
  const pgHandle = profile.builds.PG.attributes.ballHandle;
  profile = selectPosition(profile, "C").profile;
  profile = upgradeAttribute(profile, "block").profile;
  assert.equal(profile.builds.PG.attributes.ballHandle, pgHandle);
  assert.equal(profile.builds.C.attributes.block, POSITION_PRESETS.C.base.block + 1);
});

test("upgrade costs charge once, apply one point, and enforce cap and balance", () => {
  let profile = createDefaultProfile();
  const current = profile.builds.PG.attributes.ballHandle;
  const cost = getUpgradeCost(current);
  profile.credits = cost;
  const upgraded = upgradeAttribute(profile, "ballHandle");
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.profile.credits, 0);
  assert.equal(upgraded.profile.builds.PG.attributes.ballHandle, current + 1);
  assert.equal(upgradeAttribute(upgraded.profile, "ballHandle").reason, "insufficient-credits");

  upgraded.profile.credits = 100000;
  upgraded.profile.builds.PG.attributes.block = POSITION_PRESETS.PG.caps.block;
  assert.equal(upgradeAttribute(upgraded.profile, "block").reason, "at-cap");
});

test("match rewards are idempotent and update only the selected build", () => {
  let profile = createDefaultProfile();
  const startingCredits = profile.credits;
  const result = awardMatch(profile, { matchId: "run-17", won: true, mode: "street", difficulty: "pro" });
  assert.equal(result.ok, true);
  assert.ok(result.credits > 0);
  assert.equal(result.winCredits, WIN_CREDIT_BONUS);
  assert.equal(result.credits, result.baseCredits + 10);
  assert.equal(result.profile.builds.PG.games, 1);
  assert.equal(result.profile.builds.PG.wins, 1);
  assert.equal(result.profile.builds.C.games, 0);
  assert.equal(result.profile.credits, startingCredits + result.credits);
  const duplicate = awardMatch(result.profile, { matchId: "run-17", won: true, mode: "street", difficulty: "pro" });
  assert.equal(duplicate.reason, "already-rewarded");
  assert.equal(duplicate.profile.credits, result.profile.credits);
});

test("loss rewards preserve the existing base pay without a win component", () => {
  const profile = createDefaultProfile();
  const result = awardMatch(profile, { matchId: "loss-1", won: false, mode: "street", difficulty: "pro" });
  assert.equal(result.ok, true);
  assert.equal(result.winCredits, 0);
  assert.equal(result.credits, result.baseCredits);
  assert.equal(result.profile.builds.PG.wins, 0);
});

test("fresh profiles require a normalized player name and save customization", () => {
  const profile = createDefaultProfile();
  assert.equal(getProfileSummary(profile).needsOnboarding, true);
  assert.equal(updatePlayerIdentity(profile, { displayName: "   " }).reason, "invalid-display-name");
  const updated = updatePlayerIdentity(profile, {
    displayName: "  Nova🏀   Kid  ",
    jerseyNumber: 123,
    appearanceId: "braided",
  });
  assert.equal(updated.ok, true);
  assert.equal(updated.profile.identity.displayName, "Nova Kid");
  assert.equal(updated.profile.identity.jerseyNumber, 99);
  assert.equal(updated.profile.identity.appearanceId, "braided");
  assert.equal(getProfileSummary(updated.profile).needsOnboarding, false);
  const config = getEnginePlayerConfig(updated.profile);
  assert.equal(config.name, "Nova Kid");
  assert.equal(config.jerseyNumber, 99);
  assert.equal(config.hairStyle, "braids");
  assert.equal(AVATAR_APPEARANCES.some((item) => item.id === config.appearanceId), true);
});

test("legacy saves migrate to an established identity without prompting again", () => {
  const migrated = normalizeProfile({ version: 2, selectedPosition: "PG", builds: createDefaultProfile().builds });
  assert.equal(migrated.identity.created, true);
  assert.equal(migrated.identity.displayName, "Ace Nova");
  assert.equal(getProfileSummary(migrated).needsOnboarding, false);
});

test("overall titles unlock every five OVR, Legend at 99, and privileged titles need flags", () => {
  const profile = createDefaultProfile();
  const available = getAvailableTitles(profile);
  assert.equal(available.some((title) => title.id === "dev"), false);
  assert.equal(available.some((title) => title.id === "owner"), false);
  assert.equal(available.some((title) => title.id === "ovr-60"), true);
  assert.equal(selectTitle(profile, "dev").reason, "title-locked");

  profile.entitlements.tester = true;
  assert.equal(getAvailableTitles(profile).some((title) => title.id === "tester"), true);
  assert.equal(selectTitle(profile, "tester").ok, true);

  for (const key of Object.keys(profile.builds.PG.attributes)) profile.builds.PG.attributes[key] = 999;
  const maxTitles = getAvailableTitles(profile);
  assert.equal(maxTitles.some((title) => title.id === "legend"), true);
  assert.equal(selectTitle(profile, "legend").ok, true);
});

test("levels rise from play XP and stop at 99", () => {
  assert.equal(levelFromXp(0), 1);
  assert.ok(levelFromXp(5000) > 1);
  assert.equal(levelFromXp(Number.MAX_SAFE_INTEGER), 99);
});

test("cosmetics require ownership, cannot double charge, and equip on purchase", () => {
  let profile = createDefaultProfile();
  assert.equal(equipCosmetic(profile, "voidRunner").reason, "not-owned");
  profile.credits = 5000;
  const bought = purchaseCosmetic(profile, "voidRunner");
  assert.equal(bought.ok, true);
  assert.equal(bought.profile.cosmetics.equipped, "voidRunner");
  assert.equal(bought.profile.credits, 5000 - 1250);
  assert.equal(purchaseCosmetic(bought.profile, "voidRunner").reason, "already-owned");
  assert.equal(equipCosmetic(bought.profile, "novaPulse").ok, true);
});

test("engine configuration exposes applied ratings, physique, and palette", () => {
  let profile = createDefaultProfile();
  profile.credits = 10000;
  profile = upgradeAttribute(profile, "threePoint").profile;
  const config = getEnginePlayerConfig(profile);
  assert.equal(config.positionRole, "PG");
  assert.equal(config.ratings.threePoint, POSITION_PRESETS.PG.base.threePoint + 1);
  assert.ok(config.shooting > 0 && config.shooting <= 1);
  assert.ok(config.speed > 3.5);
  assert.equal(config.primary, COSMETIC_PALETTES[0].colors.primary);
  assert.equal(config.overall, getProfileSummary(profile).overall);
});

