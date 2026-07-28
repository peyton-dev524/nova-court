import { SHOT_METER_PERFECT_HALF_WIDTH } from "./shot-coverage.js";

export const DEFAULT_SHOOTING_ASSIST = 0.5;
export const EXPERT_SHOT_HALF_WIDTH = 0.024;
export const RELAXED_SHOT_HALF_WIDTH = 0.064;

const clamp01 = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SHOOTING_ASSIST;
  return Math.max(0, Math.min(1, number));
};

const lerp = (start, end, amount) => start + (end - start) * amount;

export function normalizeShootingAssist(value = DEFAULT_SHOOTING_ASSIST) {
  return clamp01(value);
}

export function userShotPerfectHalfWidth(value = DEFAULT_SHOOTING_ASSIST) {
  const assist = normalizeShootingAssist(value);
  if (assist <= 0.5) {
    return lerp(EXPERT_SHOT_HALF_WIDTH, SHOT_METER_PERFECT_HALF_WIDTH, assist * 2);
  }
  return lerp(
    SHOT_METER_PERFECT_HALF_WIDTH,
    RELAXED_SHOT_HALF_WIDTH,
    (assist - 0.5) * 2,
  );
}

export function shotPerfectHalfWidthForPlayer(
  player,
  assist = DEFAULT_SHOOTING_ASSIST,
) {
  return player?.controlled
    ? userShotPerfectHalfWidth(assist)
    : SHOT_METER_PERFECT_HALF_WIDTH;
}

export function shootingAssistDisplay(value = DEFAULT_SHOOTING_ASSIST) {
  const assist = normalizeShootingAssist(value);
  const halfWidth = userShotPerfectHalfWidth(assist);
  const label = assist < 0.2
    ? "EXPERT"
    : assist < 0.45
      ? "CHALLENGING"
      : assist < 0.7
        ? "STANDARD"
        : assist < 0.9
          ? "FORGIVING"
          : "RELAXED";
  return Object.freeze({
    assist,
    label,
    halfWidth,
    windowWidth: halfWidth * 2,
    windowPercent: halfWidth * 200,
  });
}
