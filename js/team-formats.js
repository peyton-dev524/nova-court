/**
 * Authoritative team-format data for NOVA COURT.
 *
 * This module is deliberately free of Three.js and DOM dependencies. The app
 * turns roster spawn points into Vector3 instances and the engine consumes the
 * geometry/basket contract. Keeping the rules here makes direction changes,
 * AI snapshots and browser tests deterministic.
 */

export const TEAM_FORMAT_IDS = Object.freeze({
  DUOS: "half_court_2v2",
  TRIOS: "half_court_3v3",
  FULL_FIVE: "full_court_5v5",
});

export const COURT_SPECS = Object.freeze({
  half: Object.freeze({
    kind: "half",
    width: 15,
    length: 14,
    halfWidth: 7.5,
    halfLength: 7,
    threePointRadius: 6.15,
    baskets: Object.freeze({
      home: Object.freeze({ x: 0, y: 3.05, z: -5.7, backboardZ: -6.16, attackSign: -1 }),
      away: Object.freeze({ x: 0, y: 3.05, z: -5.7, backboardZ: -6.16, attackSign: -1 }),
    }),
  }),
  full: Object.freeze({
    kind: "full",
    width: 15,
    length: 28,
    halfWidth: 7.5,
    halfLength: 14,
    threePointRadius: 6.75,
    baskets: Object.freeze({
      home: Object.freeze({ x: 0, y: 3.05, z: -12.68, backboardZ: -13.14, attackSign: -1 }),
      away: Object.freeze({ x: 0, y: 3.05, z: 12.68, backboardZ: 13.14, attackSign: 1 }),
    }),
  }),
});

const HOME_STYLE = Object.freeze({
  primary: 0x1fb8d5,
  accent: 0xffd166,
  shoeColor: 0xf4fbff,
});

const AWAY_STYLE = Object.freeze({
  primary: 0xc93b58,
  accent: 0xffb15f,
  shoeColor: 0xffddd1,
});

const PLAYERS = Object.freeze({
  home: Object.freeze([
    Object.freeze({ slug: "ace", name: "Ace Nova", position: "PG", role: "handler", height: 1.88, shooting: 0.86, passing: 0.9, rebounding: 0.59, vertical: 0.82, skinColor: 0x9d6548 }),
    Object.freeze({ slug: "lyric", name: "Lyric Vale", position: "SG", role: "wing", height: 1.93, shooting: 0.89, passing: 0.78, rebounding: 0.62, vertical: 0.77, skinColor: 0x6d4431 }),
    Object.freeze({ slug: "sol", name: "Sol Mercer", position: "SF", role: "two_way", height: 1.99, shooting: 0.81, passing: 0.75, rebounding: 0.75, vertical: 0.84, skinColor: 0xb97858 }),
    Object.freeze({ slug: "forge", name: "Forge Lane", position: "PF", role: "big", height: 2.04, shooting: 0.72, passing: 0.68, rebounding: 0.89, vertical: 0.82, skinColor: 0x774633 }),
    Object.freeze({ slug: "atlas", name: "Atlas Reed", position: "C", role: "big", height: 2.09, shooting: 0.67, passing: 0.65, rebounding: 0.95, vertical: 0.86, skinColor: 0xbf8062 }),
  ]),
  away: Object.freeze([
    Object.freeze({ slug: "shade", name: "Shade Voss", position: "PG", role: "handler", height: 1.87, shooting: 0.86, passing: 0.88, rebounding: 0.58, vertical: 0.85, skinColor: 0x5f382a }),
    Object.freeze({ slug: "rift", name: "Rift Monroe", position: "SG", role: "wing", height: 1.94, shooting: 0.85, passing: 0.77, rebounding: 0.64, vertical: 0.79, skinColor: 0xd2a181 }),
    Object.freeze({ slug: "ember", name: "Ember Cross", position: "SF", role: "two_way", height: 2, shooting: 0.8, passing: 0.73, rebounding: 0.77, vertical: 0.86, skinColor: 0x8d5740 }),
    Object.freeze({ slug: "vault", name: "Vault Stone", position: "PF", role: "big", height: 2.05, shooting: 0.7, passing: 0.67, rebounding: 0.9, vertical: 0.83, skinColor: 0xc58a68 }),
    Object.freeze({ slug: "onyx", name: "Onyx Hale", position: "C", role: "big", height: 2.1, shooting: 0.66, passing: 0.64, rebounding: 0.96, vertical: 0.88, skinColor: 0x7c4b37 }),
  ]),
});

const HALF_SPAWNS = Object.freeze({
  home: Object.freeze([
    Object.freeze({ x: 0, z: 3.7 }),
    Object.freeze({ x: -4.35, z: 0.75 }),
    Object.freeze({ x: 3.15, z: -1.25 }),
  ]),
  away: Object.freeze([
    Object.freeze({ x: 0.45, z: 1.2 }),
    Object.freeze({ x: -3.35, z: -0.2 }),
    Object.freeze({ x: 2.65, z: -1.95 }),
  ]),
});

const FULL_SPAWNS = Object.freeze({
  home: Object.freeze([
    Object.freeze({ x: 0, z: 8.6 }),
    Object.freeze({ x: -4.7, z: 6.4 }),
    Object.freeze({ x: 4.15, z: 4.2 }),
    Object.freeze({ x: -2.55, z: 0.7 }),
    Object.freeze({ x: 2.4, z: -2.2 }),
  ]),
  away: Object.freeze([
    Object.freeze({ x: 0.4, z: 6.7 }),
    Object.freeze({ x: -4.1, z: 4.5 }),
    Object.freeze({ x: 4.35, z: 2.9 }),
    Object.freeze({ x: -2.3, z: -0.15 }),
    Object.freeze({ x: 2.3, z: -2.9 }),
  ]),
});

export const TEAM_FORMATS = Object.freeze({
  [TEAM_FORMAT_IDS.DUOS]: Object.freeze({
    id: TEAM_FORMAT_IDS.DUOS,
    key: "duos",
    label: "NOVA DUOS",
    shortLabel: "2V2",
    description: "Two-on-two half-court basketball. First to 13, win by two.",
    playersPerTeam: 2,
    court: COURT_SPECS.half,
    targetScore: 13,
    winBy: 2,
    scoreCap: 19,
    gameDuration: 240,
    shotClock: 16,
    requiresClear: true,
  }),
  [TEAM_FORMAT_IDS.TRIOS]: Object.freeze({
    id: TEAM_FORMAT_IDS.TRIOS,
    key: "team",
    label: "NIGHT THREES",
    shortLabel: "3V3",
    description: "Three-on-three half-court basketball. First to 15, win by two.",
    playersPerTeam: 3,
    court: COURT_SPECS.half,
    targetScore: 15,
    winBy: 2,
    scoreCap: 21,
    gameDuration: 300,
    shotClock: 16,
    requiresClear: true,
  }),
  [TEAM_FORMAT_IDS.FULL_FIVE]: Object.freeze({
    id: TEAM_FORMAT_IDS.FULL_FIVE,
    key: "fives",
    label: "NOVA FIVE",
    shortLabel: "5V5",
    description: "Full-court, two-basket basketball with all five positions.",
    playersPerTeam: 5,
    court: COURT_SPECS.full,
    targetScore: 21,
    winBy: 1,
    scoreCap: 30,
    gameDuration: 360,
    shotClock: 24,
    requiresClear: false,
  }),
});

export function getTeamFormat(formatOrId = TEAM_FORMAT_IDS.TRIOS) {
  const id = typeof formatOrId === "string" ? formatOrId : formatOrId?.id;
  const format = TEAM_FORMATS[id];
  if (!format) throw new RangeError(`Unknown team format: ${String(id)}`);
  return format;
}

export function getFormatForModeKey(modeKey) {
  if (modeKey === "duos") return TEAM_FORMATS[TEAM_FORMAT_IDS.DUOS];
  if (modeKey === "fives") return TEAM_FORMATS[TEAM_FORMAT_IDS.FULL_FIVE];
  if (modeKey === "team") return TEAM_FORMATS[TEAM_FORMAT_IDS.TRIOS];
  return null;
}

export function attackBasketForTeam(formatOrId, teamId) {
  const format = getTeamFormat(formatOrId);
  return format.court.baskets[teamId] || format.court.baskets.home;
}

export function defenseBasketForTeam(formatOrId, teamId) {
  return attackBasketForTeam(formatOrId, teamId === "home" ? "away" : "home");
}

export function createTeamRoster(formatOrId, { controlledTeam = "home" } = {}) {
  const format = getTeamFormat(formatOrId);
  const spawns = format.court.kind === "full" ? FULL_SPAWNS : HALF_SPAWNS;
  const count = format.playersPerTeam;
  return ["home", "away"].flatMap((team) => PLAYERS[team].slice(0, count).map((template, index) => {
    const style = team === "home" ? HOME_STYLE : AWAY_STYLE;
    const spawn = spawns[team][index];
    return {
      id: `${team}-${template.slug}`,
      name: template.name,
      team,
      controlled: team === controlledTeam && index === 0,
      isAI: !(team === controlledTeam && index === 0),
      role: template.role,
      courtPosition: template.position,
      height: template.height,
      shooting: template.shooting,
      passing: template.passing,
      rebounding: template.rebounding,
      vertical: template.vertical,
      primary: style.primary,
      accent: style.accent,
      shoeColor: style.shoeColor,
      skinColor: template.skinColor,
      position: { x: spawn.x, y: 0, z: spawn.z },
    };
  }));
}

export function restartSpotForTeam(formatOrId, teamId, reason = "inbound") {
  const format = getTeamFormat(formatOrId);
  if (format.court.kind === "half") return { x: 0, y: 0, z: 3.7 };
  const basket = defenseBasketForTeam(format, teamId);
  const inward = -basket.attackSign;
  return {
    x: reason === "sideline" ? format.court.halfWidth - 0.7 : 0,
    y: 0,
    z: basket.z + inward * 1.65,
  };
}

export function isOutsideCourt(formatOrId, position, margin = 0) {
  const format = getTeamFormat(formatOrId);
  return Math.abs(Number(position?.x) || 0) > format.court.halfWidth + margin
    || Math.abs(Number(position?.z) || 0) > format.court.halfLength + margin;
}

export function getAttackBaskets(formatOrId) {
  const format = getTeamFormat(formatOrId);
  return {
    home: { ...format.court.baskets.home },
    away: { ...format.court.baskets.away },
  };
}

export function isTeamModeKey(modeKey) {
  return Boolean(getFormatForModeKey(modeKey));
}

