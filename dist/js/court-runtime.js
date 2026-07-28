import {
  COURT_SPECS,
  attackBasketForTeam,
  getFormatForModeKey,
} from "./team-formats.js";

export function createCourtRuntime(modeKey) {
  const format = getFormatForModeKey(modeKey);
  const spec = format?.court || COURT_SPECS.half;
  return {
    kind: spec.kind,
    width: spec.width,
    length: spec.length,
    halfWidth: spec.halfWidth,
    halfLength: spec.halfLength,
    threePointRadius: spec.threePointRadius,
    ballRadius: 0.12,
    rimRadius: 0.23,
    rimY: 3.05,
    baskets: {
      home: { ...spec.baskets.home },
      away: { ...spec.baskets.away },
    },
  };
}

export function basketForPossession(runtime, teamId = "home") {
  const basket = runtime?.baskets?.[teamId] || runtime?.baskets?.home;
  if (!basket) return { x: 0, y: 3.05, z: -5.7, backboardZ: -6.16, attackSign: -1 };
  return basket;
}

export function shotValueForRuntime(runtime, position, teamId) {
  const basket = basketForPossession(runtime, teamId);
  return Math.hypot((Number(position?.x) || 0) - basket.x, (Number(position?.z) || 0) - basket.z)
    >= runtime.threePointRadius ? 3 : 2;
}

export function clampPlayerToRuntime(runtime, position, margin = 0.42) {
  return {
    x: Math.max(-runtime.halfWidth + margin, Math.min(runtime.halfWidth - margin, Number(position?.x) || 0)),
    z: Math.max(-runtime.halfLength + margin, Math.min(runtime.halfLength - margin, Number(position?.z) || 0)),
  };
}

export function basketCollisionCandidates(runtime, ballPosition) {
  const baskets = Object.entries(runtime?.baskets || {});
  if (runtime?.kind !== "full") return baskets.slice(0, 1);
  return baskets
    .map(([teamId, basket]) => ({
      teamId,
      basket,
      distance: Math.abs((Number(ballPosition?.z) || 0) - basket.z),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 1)
    .map(({ teamId, basket }) => [teamId, basket]);
}

export function getAttackBasketForMode(modeKey, teamId) {
  const format = getFormatForModeKey(modeKey);
  return format ? attackBasketForTeam(format.id, teamId) : COURT_SPECS.half.baskets.home;
}

export function getTeamCameraContract(modeKey) {
  const format = getFormatForModeKey(modeKey);
  if (!format) {
    return {
      mode: "follow",
      minFov: 38,
      maxFov: 43,
      trackingDamping: 4.2,
      preservesManualCycle: true,
    };
  }
  const fullCourt = format.court.kind === "full";
  return {
    mode: "broadcast",
    minFov: fullCourt ? 48 : format.playersPerTeam >= 4 ? 43 : 40,
    maxFov: fullCourt ? 52 : format.playersPerTeam >= 4 ? 47 : 44,
    trackingDamping: fullCourt ? 3.6 : 4.2,
    targetDamping: 6.4,
    lateralOffset: fullCourt ? format.court.halfWidth + 2.45 : format.court.halfWidth + 0.72,
    tracksTransitionDirection: true,
    includesActiveBasket: true,
    preservesManualCycle: true,
  };
}

