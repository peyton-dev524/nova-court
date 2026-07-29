import {
  BASKETBALL_SHOE_STYLES,
  normalizeBasketballShoeStyle,
} from "./basketball-shoes.js?v=1.3";

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const copy = (value) => JSON.parse(JSON.stringify(value));

export const PROFILE_SCHEMA_VERSION = 4;
export const PROFILE_STORAGE_KEY = "nova-court-my-player-v2";
export const WIN_CREDIT_BONUS = 10;
export const ATTRIBUTE_GROUPS = Object.freeze({
  Finishing: Object.freeze(["closeShot", "drivingLayup", "drivingDunk"]),
  Shooting: Object.freeze(["midRange", "threePoint", "freeThrow"]),
  Playmaking: Object.freeze(["passAccuracy", "ballHandle", "speedWithBall"]),
  Defense: Object.freeze(["perimeterDefense", "steal", "block", "interiorDefense", "defensiveRebound"]),
  Athleticism: Object.freeze(["speed", "acceleration", "strength", "vertical", "stamina"]),
});

export const ATTRIBUTE_LABELS = Object.freeze({
  closeShot: "Close shot",
  drivingLayup: "Driving layup",
  drivingDunk: "Driving dunk",
  midRange: "Mid-range",
  threePoint: "Three-point",
  freeThrow: "Free throw",
  passAccuracy: "Pass accuracy",
  ballHandle: "Ball handle",
  speedWithBall: "Speed with ball",
  perimeterDefense: "Perimeter defense",
  steal: "Steal",
  block: "Block",
  interiorDefense: "Interior defense",
  defensiveRebound: "Defensive rebound",
  speed: "Speed",
  acceleration: "Acceleration",
  strength: "Strength",
  vertical: "Vertical",
  stamina: "Stamina",
});

const ALL_ATTRIBUTES = Object.freeze(Object.values(ATTRIBUTE_GROUPS).flat());
const caps = (overrides) => Object.fromEntries(ALL_ATTRIBUTES.map((key) => [key, overrides[key] ?? 88]));
const ratings = (overrides) => Object.fromEntries(ALL_ATTRIBUTES.map((key) => [key, overrides[key] ?? 60]));

export const POSITION_PRESETS = Object.freeze({
  PG: Object.freeze({
    name: "Point Guard",
    archetype: "Tempo Creator",
    height: 1.86,
    role: "handler",
    base: ratings({ closeShot: 62, drivingLayup: 68, midRange: 65, threePoint: 67, freeThrow: 70, passAccuracy: 72, ballHandle: 74, speedWithBall: 73, perimeterDefense: 63, steal: 64, speed: 73, acceleration: 74, stamina: 72 }),
    caps: caps({ drivingLayup: 94, midRange: 94, threePoint: 96, freeThrow: 94, passAccuracy: 99, ballHandle: 99, speedWithBall: 99, perimeterDefense: 92, steal: 93, speed: 96, acceleration: 97, strength: 78, block: 74, interiorDefense: 72, defensiveRebound: 77 }),
    weights: { passAccuracy: 1.45, ballHandle: 1.55, speedWithBall: 1.35, threePoint: 1.15, perimeterDefense: 1.05, speed: 1.15, acceleration: 1.15 },
  }),
  SG: Object.freeze({
    name: "Shooting Guard",
    archetype: "Three-Level Spark",
    height: 1.94,
    role: "wing",
    base: ratings({ closeShot: 65, drivingLayup: 68, drivingDunk: 64, midRange: 69, threePoint: 71, freeThrow: 72, passAccuracy: 63, ballHandle: 68, speedWithBall: 67, perimeterDefense: 66, steal: 63, speed: 69, acceleration: 69, vertical: 66, stamina: 72 }),
    caps: caps({ closeShot: 94, drivingLayup: 96, drivingDunk: 92, midRange: 98, threePoint: 99, freeThrow: 97, passAccuracy: 90, ballHandle: 94, speedWithBall: 93, perimeterDefense: 95, steal: 91, block: 80, interiorDefense: 78, defensiveRebound: 83, speed: 94, acceleration: 94, vertical: 92, strength: 84 }),
    weights: { drivingLayup: 1.15, midRange: 1.35, threePoint: 1.5, freeThrow: 1.1, ballHandle: 1.15, perimeterDefense: 1.15, speed: 1.05 },
  }),
  SF: Object.freeze({
    name: "Small Forward",
    archetype: "Two-Way Catalyst",
    height: 2.01,
    role: "wing",
    base: ratings({ closeShot: 67, drivingLayup: 68, drivingDunk: 68, midRange: 66, threePoint: 65, passAccuracy: 62, ballHandle: 65, speedWithBall: 64, perimeterDefense: 68, steal: 64, block: 61, interiorDefense: 62, defensiveRebound: 65, speed: 67, acceleration: 65, strength: 67, vertical: 68, stamina: 70 }),
    caps: caps({ closeShot: 96, drivingLayup: 96, drivingDunk: 96, midRange: 95, threePoint: 94, passAccuracy: 92, ballHandle: 93, speedWithBall: 91, perimeterDefense: 97, steal: 94, block: 91, interiorDefense: 91, defensiveRebound: 92, speed: 93, acceleration: 91, strength: 93, vertical: 94 }),
    weights: { drivingLayup: 1.1, drivingDunk: 1.15, midRange: 1.05, threePoint: 1.05, perimeterDefense: 1.25, interiorDefense: 1.05, speed: 1.05, strength: 1.05 },
  }),
  PF: Object.freeze({
    name: "Power Forward",
    archetype: "Interior Connector",
    height: 2.06,
    role: "big",
    base: ratings({ closeShot: 71, drivingLayup: 66, drivingDunk: 72, midRange: 64, threePoint: 59, passAccuracy: 60, ballHandle: 57, perimeterDefense: 61, block: 69, interiorDefense: 71, defensiveRebound: 72, speed: 61, strength: 74, vertical: 69, stamina: 68 }),
    caps: caps({ closeShot: 98, drivingLayup: 93, drivingDunk: 98, midRange: 93, threePoint: 88, freeThrow: 91, passAccuracy: 89, ballHandle: 84, speedWithBall: 82, perimeterDefense: 90, steal: 86, block: 97, interiorDefense: 98, defensiveRebound: 98, speed: 88, acceleration: 86, strength: 98, vertical: 96 }),
    weights: { closeShot: 1.2, drivingDunk: 1.25, block: 1.2, interiorDefense: 1.35, defensiveRebound: 1.35, strength: 1.25, vertical: 1.05 },
  }),
  C: Object.freeze({
    name: "Center",
    archetype: "Paint Anchor",
    height: 2.12,
    role: "big",
    base: ratings({ closeShot: 74, drivingLayup: 63, drivingDunk: 73, midRange: 58, threePoint: 52, passAccuracy: 57, ballHandle: 50, speedWithBall: 49, perimeterDefense: 57, steal: 55, block: 74, interiorDefense: 76, defensiveRebound: 75, speed: 56, acceleration: 54, strength: 78, vertical: 68, stamina: 68 }),
    caps: caps({ closeShot: 99, drivingLayup: 90, drivingDunk: 99, midRange: 88, threePoint: 82, freeThrow: 88, passAccuracy: 87, ballHandle: 77, speedWithBall: 74, perimeterDefense: 84, steal: 82, block: 99, interiorDefense: 99, defensiveRebound: 99, speed: 83, acceleration: 80, strength: 99, vertical: 95 }),
    weights: { closeShot: 1.35, drivingDunk: 1.2, block: 1.45, interiorDefense: 1.55, defensiveRebound: 1.5, strength: 1.35, vertical: 1.05 },
  }),
});

export const COSMETIC_PALETTES = Object.freeze([
  Object.freeze({ id: "novaPulse", name: "Nova Pulse", cost: 0, colors: { primary: 0x38e8ff, accent: 0xf4fbff, shoes: 0xf4fbff, skin: 0x9d6548 } }),
  Object.freeze({ id: "emberCircuit", name: "Ember Circuit", cost: 450, colors: { primary: 0xff6438, accent: 0xffd166, shoes: 0xfff1dc, skin: 0x9d6548 } }),
  Object.freeze({ id: "auroraGrid", name: "Aurora Grid", cost: 700, colors: { primary: 0x5af29b, accent: 0x965cff, shoes: 0xe8fff2, skin: 0x9d6548 } }),
  Object.freeze({ id: "solarFlare", name: "Solar Flare", cost: 950, colors: { primary: 0xffc857, accent: 0xef476f, shoes: 0x251729, skin: 0x9d6548 } }),
  Object.freeze({ id: "voidRunner", name: "Void Runner", cost: 1250, colors: { primary: 0x29283f, accent: 0xb6fbff, shoes: 0x11121c, skin: 0x9d6548 } }),
  Object.freeze({ id: "prismRush", name: "Prism Rush", cost: 1800, colors: { primary: 0xe947ff, accent: 0x35f3ff, shoes: 0xfff7ff, skin: 0x9d6548 } }),
]);

export const AVATAR_APPEARANCES = Object.freeze([
  Object.freeze({ id: "classic", name: "Classic", hair: "crop", headShape: "round", skin: 0x9d6548 }),
  Object.freeze({ id: "highTop", name: "High Top", hair: "highTop", headShape: "long", skin: 0x75442f }),
  Object.freeze({ id: "braided", name: "Braided", hair: "braids", headShape: "round", skin: 0x4f2f25 }),
  Object.freeze({ id: "fade", name: "Fade", hair: "fade", headShape: "wide", skin: 0xc88a68 }),
]);

const MILESTONE_TITLE_NAMES = Object.freeze({
  25: "PROSPECT",
  30: "SPARK",
  35: "UPSTART",
  40: "PLAYMAKER",
  45: "BUCKET GETTER",
  50: "TWO-WAY",
  55: "COURT GENERAL",
  60: "NIGHT SHIFT",
  65: "HEADLINER",
  70: "SHOWSTOPPER",
  75: "FRANCHISE",
  80: "ALL-NOVA",
  85: "SUPERSTAR",
  90: "ICON",
  95: "IMMORTAL",
});

export const TITLE_DEFINITIONS = Object.freeze([
  ...Object.entries(MILESTONE_TITLE_NAMES).map(([overall, name]) => Object.freeze({
    id: `ovr-${overall}`,
    name,
    kind: "overall",
    requiredOverall: Number(overall),
  })),
  Object.freeze({ id: "legend", name: "LEGEND", kind: "overall", requiredOverall: 99 }),
  Object.freeze({ id: "dev", name: "DEV", kind: "entitlement", entitlement: "dev" }),
  Object.freeze({ id: "tester", name: "TESTER", kind: "entitlement", entitlement: "tester" }),
  Object.freeze({ id: "owner", name: "OWNER", kind: "entitlement", entitlement: "owner" }),
]);

export function normalizeDisplayName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} _.'-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 18);
}

function makeBuild(position) {
  return {
    position,
    attributes: { ...POSITION_PRESETS[position].base },
    games: 0,
    wins: 0,
    xp: 0,
    level: 1,
  };
}

export function createDefaultProfile() {
  return {
    version: PROFILE_SCHEMA_VERSION,
    selectedPosition: "PG",
    credits: 600,
    builds: Object.fromEntries(Object.keys(POSITION_PRESETS).map((position) => [position, makeBuild(position)])),
    cosmetics: { owned: ["novaPulse"], equipped: "novaPulse" },
    identity: {
      created: false,
      displayName: "",
      jerseyNumber: 1,
      appearanceId: "classic",
      shoeStyleId: "nova-flight",
      selectedTitle: "ovr-25",
    },
    entitlements: { dev: false, tester: false, owner: false },
    rewardedMatches: [],
    updatedAt: 0,
  };
}

export function calculateOverall(buildOrPosition, maybeAttributes) {
  const position = typeof buildOrPosition === "string" ? buildOrPosition : buildOrPosition?.position;
  const attributes = maybeAttributes || buildOrPosition?.attributes || {};
  const preset = POSITION_PRESETS[position] || POSITION_PRESETS.PG;
  let weighted = 0;
  let totalWeight = 0;
  for (const key of ALL_ATTRIBUTES) {
    const weight = preset.weights[key] || 0.82;
    const rating = clamp(attributes[key], 25, preset.caps[key]);
    weighted += (rating / preset.caps[key]) * 99 * weight;
    totalWeight += weight;
  }
  return clamp(Math.round(weighted / totalWeight), 25, 99);
}

export function levelFromXp(xp) {
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  return Math.min(99, Math.floor(Math.sqrt(safeXp / 120)) + 1);
}

export function xpForNextLevel(level) {
  const safeLevel = clamp(Math.floor(level), 1, 99);
  return safeLevel >= 99 ? null : safeLevel * safeLevel * 120;
}

export function getUpgradeCost(currentValue) {
  const rating = clamp(Math.floor(currentValue), 25, 99);
  return 35 + Math.max(0, rating - 55) * 6 + Math.max(0, rating - 80) * 10;
}

function normalizeBuild(candidate, position) {
  const preset = POSITION_PRESETS[position];
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const attributes = {};
  for (const key of ALL_ATTRIBUTES) {
    attributes[key] = Math.round(clamp(source.attributes?.[key] ?? preset.base[key], 25, preset.caps[key]));
  }
  const xp = Math.max(0, Math.floor(Number(source.xp) || 0));
  return {
    position,
    attributes,
    games: Math.max(0, Math.floor(Number(source.games) || 0)),
    wins: Math.max(0, Math.min(Math.floor(Number(source.wins) || 0), Math.max(0, Math.floor(Number(source.games) || 0)))),
    xp,
    level: levelFromXp(xp),
  };
}

export function normalizeProfile(candidate) {
  const defaults = createDefaultProfile();
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const selectedPosition = POSITION_PRESETS[source.selectedPosition] ? source.selectedPosition : "PG";
  const validCosmetics = new Set(COSMETIC_PALETTES.map((item) => item.id));
  const owned = [...new Set(["novaPulse", ...(Array.isArray(source.cosmetics?.owned) ? source.cosmetics.owned : [])])]
    .filter((id) => validCosmetics.has(id));
  const equipped = owned.includes(source.cosmetics?.equipped) ? source.cosmetics.equipped : "novaPulse";
  const legacyProfile = Number(source.version) > 0 && Number(source.version) < PROFILE_SCHEMA_VERSION;
  const displayName = normalizeDisplayName(source.identity?.displayName ?? source.displayName);
  const validAppearances = new Set(AVATAR_APPEARANCES.map((item) => item.id));
  const identity = {
    created: Boolean(source.identity?.created ?? legacyProfile),
    displayName: displayName || (legacyProfile ? "Ace Nova" : ""),
    jerseyNumber: Math.round(clamp(source.identity?.jerseyNumber ?? source.jerseyNumber ?? 1, 0, 99)),
    appearanceId: validAppearances.has(source.identity?.appearanceId) ? source.identity.appearanceId : "classic",
    shoeStyleId: normalizeBasketballShoeStyle(source.identity?.shoeStyleId ?? source.shoeStyleId),
    selectedTitle: String(source.identity?.selectedTitle || "ovr-25"),
  };
  if (!identity.displayName) identity.created = false;
  const entitlements = {
    dev: source.entitlements?.dev === true,
    tester: source.entitlements?.tester === true,
    owner: source.entitlements?.owner === true,
  };
  const normalized = {
    version: PROFILE_SCHEMA_VERSION,
    selectedPosition,
    credits: Math.max(0, Math.floor(Number(source.credits ?? defaults.credits) || 0)),
    builds: Object.fromEntries(Object.keys(POSITION_PRESETS).map((position) => [
      position,
      normalizeBuild(source.builds?.[position] || (source.position === position ? source : null), position),
    ])),
    cosmetics: { owned, equipped },
    identity,
    entitlements,
    rewardedMatches: [...new Set(Array.isArray(source.rewardedMatches) ? source.rewardedMatches.map(String) : [])].slice(-80),
    updatedAt: Math.max(0, Math.floor(Number(source.updatedAt) || 0)),
  };
  const availableTitleIds = new Set(getAvailableTitles(normalized).map((title) => title.id));
  if (!availableTitleIds.has(normalized.identity.selectedTitle)) normalized.identity.selectedTitle = "ovr-25";
  return normalized;
}

export function getAvailableTitles(profile) {
  const source = profile && typeof profile === "object" ? profile : createDefaultProfile();
  const selectedPosition = POSITION_PRESETS[source.selectedPosition] ? source.selectedPosition : "PG";
  const build = normalizeBuild(source.builds?.[selectedPosition], selectedPosition);
  const overall = calculateOverall(build);
  return TITLE_DEFINITIONS.filter((title) => title.kind === "overall"
    ? overall >= title.requiredOverall
    : source.entitlements?.[title.entitlement] === true);
}

export function updatePlayerIdentity(profile, changes = {}) {
  const next = normalizeProfile(profile);
  const displayName = normalizeDisplayName(changes.displayName ?? next.identity.displayName);
  if (!displayName) return { ok: false, reason: "invalid-display-name", profile: next };
  if (changes.appearanceId !== undefined
      && !AVATAR_APPEARANCES.some((item) => item.id === changes.appearanceId)) {
    return { ok: false, reason: "invalid-appearance", profile: next };
  }
  if (changes.shoeStyleId !== undefined
      && normalizeBasketballShoeStyle(changes.shoeStyleId) !== changes.shoeStyleId) {
    return { ok: false, reason: "invalid-shoe-style", profile: next };
  }
  next.identity = {
    ...next.identity,
    created: true,
    displayName,
    jerseyNumber: Math.round(clamp(changes.jerseyNumber ?? next.identity.jerseyNumber, 0, 99)),
    appearanceId: changes.appearanceId ?? next.identity.appearanceId,
    shoeStyleId: changes.shoeStyleId ?? next.identity.shoeStyleId,
  };
  return { ok: true, profile: next };
}

export function selectTitle(profile, titleId) {
  const next = normalizeProfile(profile);
  const available = getAvailableTitles(next);
  if (!available.some((title) => title.id === titleId)) {
    return { ok: false, reason: "title-locked", profile: next };
  }
  next.identity.selectedTitle = titleId;
  return { ok: true, profile: next };
}

export function loadProfile(storage = globalThis.localStorage) {
  if (!storage?.getItem) return createDefaultProfile();
  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return createDefaultProfile();
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return createDefaultProfile();
  }
}

export function saveProfile(profile, storage = globalThis.localStorage, now = Date.now()) {
  const normalized = normalizeProfile(profile);
  normalized.updatedAt = Math.max(0, Math.floor(Number(now) || 0));
  try {
    storage?.setItem?.(PROFILE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Private browsing and quota errors must not stop a match.
  }
  return normalized;
}

export function selectPosition(profile, position) {
  if (!POSITION_PRESETS[position]) return { ok: false, reason: "invalid-position", profile: normalizeProfile(profile) };
  const next = normalizeProfile(profile);
  next.selectedPosition = position;
  return { ok: true, profile: next, build: next.builds[position] };
}

export function upgradeAttribute(profile, attribute) {
  const next = normalizeProfile(profile);
  const position = next.selectedPosition;
  const build = next.builds[position];
  if (!ALL_ATTRIBUTES.includes(attribute)) return { ok: false, reason: "invalid-attribute", profile: next };
  const current = build.attributes[attribute];
  const cap = POSITION_PRESETS[position].caps[attribute];
  if (current >= cap) return { ok: false, reason: "at-cap", profile: next, cost: 0 };
  const cost = getUpgradeCost(current);
  if (next.credits < cost) return { ok: false, reason: "insufficient-credits", profile: next, cost };
  next.credits -= cost;
  build.attributes[attribute] += 1;
  return { ok: true, profile: next, cost, overall: calculateOverall(build) };
}

export function purchaseCosmetic(profile, cosmeticId) {
  const next = normalizeProfile(profile);
  const item = COSMETIC_PALETTES.find((candidate) => candidate.id === cosmeticId);
  if (!item) return { ok: false, reason: "invalid-cosmetic", profile: next };
  if (next.cosmetics.owned.includes(item.id)) return { ok: false, reason: "already-owned", profile: next, cost: 0 };
  if (next.credits < item.cost) return { ok: false, reason: "insufficient-credits", profile: next, cost: item.cost };
  next.credits -= item.cost;
  next.cosmetics.owned.push(item.id);
  next.cosmetics.equipped = item.id;
  return { ok: true, profile: next, cost: item.cost };
}

export function equipCosmetic(profile, cosmeticId) {
  const next = normalizeProfile(profile);
  if (!next.cosmetics.owned.includes(cosmeticId)) return { ok: false, reason: "not-owned", profile: next };
  next.cosmetics.equipped = cosmeticId;
  return { ok: true, profile: next };
}

export function awardMatch(profile, match = {}) {
  const next = normalizeProfile(profile);
  const matchId = String(match.matchId || "");
  if (!matchId) return { ok: false, reason: "missing-match-id", profile: next, credits: 0, xp: 0 };
  if (next.rewardedMatches.includes(matchId)) return { ok: false, reason: "already-rewarded", profile: next, credits: 0, xp: 0 };
  const build = next.builds[next.selectedPosition];
  const won = Boolean(match.won);
  const difficultyBonus = { rookie: 0, pro: 20, legend: 45 }[match.difficulty] || 0;
  const modeBonus = { street: 25, two: 35, team: 45, five: 70, threePoint: 18, practice: 0 }[match.mode] || 20;
  const baseCredits = 70 + modeBonus + difficultyBonus;
  const winCredits = won ? WIN_CREDIT_BONUS : 0;
  const credits = baseCredits + winCredits;
  const xp = 90 + modeBonus + Math.floor(difficultyBonus * 1.5) + (won ? 150 : 25);
  next.credits += credits;
  build.games += 1;
  if (won) build.wins += 1;
  build.xp += xp;
  build.level = levelFromXp(build.xp);
  next.rewardedMatches.push(matchId);
  next.rewardedMatches = next.rewardedMatches.slice(-80);
  return { ok: true, profile: next, credits, baseCredits, winCredits, xp, level: build.level };
}

export function getEnginePlayerConfig(profile) {
  const normalized = normalizeProfile(profile);
  const build = normalized.builds[normalized.selectedPosition];
  const attributes = build.attributes;
  const preset = POSITION_PRESETS[build.position];
  const palette = COSMETIC_PALETTES.find((item) => item.id === normalized.cosmetics.equipped) || COSMETIC_PALETTES[0];
  const appearance = AVATAR_APPEARANCES.find((item) => item.id === normalized.identity.appearanceId) || AVATAR_APPEARANCES[0];
  const average = (...keys) => keys.reduce((total, key) => total + attributes[key], 0) / keys.length / 100;
  const ratingsMap = { ...attributes };
  return {
    role: preset.role,
    positionRole: build.position,
    height: preset.height,
    speed: 3.55 + average("speed", "acceleration", "speedWithBall") * 1.25,
    shooting: average("midRange", "threePoint", "freeThrow"),
    finishing: average("closeShot", "drivingLayup", "drivingDunk"),
    vertical: attributes.vertical / 100,
    rebounding: average("defensiveRebound", "interiorDefense"),
    strength: attributes.strength / 100,
    ballSecurity: average("ballHandle", "speedWithBall"),
    passAccuracy: attributes.passAccuracy / 100,
    perimeterDefense: attributes.perimeterDefense / 100,
    steal: attributes.steal / 100,
    block: attributes.block / 100,
    staminaRating: attributes.stamina / 100,
    ratings: ratingsMap,
    overall: calculateOverall(build),
    primary: palette.colors.primary,
    accent: palette.colors.accent,
    shoeColor: palette.colors.shoes,
    skinColor: appearance.skin,
    name: normalized.identity.displayName || "Ace Nova",
    jerseyNumber: normalized.identity.jerseyNumber,
    appearanceId: appearance.id,
    shoeStyleId: normalized.identity.shoeStyleId,
    hairStyle: appearance.hair,
    headShape: appearance.headShape,
  };
}

export function getProfileSummary(profile) {
  const normalized = normalizeProfile(profile);
  const build = normalized.builds[normalized.selectedPosition];
  const title = TITLE_DEFINITIONS.find((item) => item.id === normalized.identity.selectedTitle) || TITLE_DEFINITIONS[0];
  return {
    position: normalized.selectedPosition,
    positionName: POSITION_PRESETS[normalized.selectedPosition].name,
    archetype: POSITION_PRESETS[normalized.selectedPosition].archetype,
    overall: calculateOverall(build),
    level: build.level,
    xp: build.xp,
    nextLevelXp: xpForNextLevel(build.level),
    games: build.games,
    wins: build.wins,
    credits: normalized.credits,
    cosmetic: COSMETIC_PALETTES.find((item) => item.id === normalized.cosmetics.equipped) || COSMETIC_PALETTES[0],
    displayName: normalized.identity.displayName || "UNNAMED PLAYER",
    jerseyNumber: normalized.identity.jerseyNumber,
    appearance: AVATAR_APPEARANCES.find((item) => item.id === normalized.identity.appearanceId) || AVATAR_APPEARANCES[0],
    shoeStyle: BASKETBALL_SHOE_STYLES.find((item) => item.id === normalized.identity.shoeStyleId)
      || BASKETBALL_SHOE_STYLES[0],
    title,
    availableTitles: getAvailableTitles(normalized),
    needsOnboarding: !normalized.identity.created,
  };
}

