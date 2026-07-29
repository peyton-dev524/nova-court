import { getGameplayHudPolicy } from "./hud-presentation.js";

export const OPEN_GYM_MODE_KEY = "practice";

const HUD_SELECTORS = Object.freeze({
  scoreboard: ".scoreboard",
  broadcastBug: "#broadcast-bug",
  playerCard: "#player-card-hud",
  momentum: "#takeover",
  controlHints: "#control-hints",
});

export function gameplayHudVisibilityForMode(modeKey) {
  const openGym = modeKey === OPEN_GYM_MODE_KEY;
  const policy = getGameplayHudPolicy(modeKey);
  return Object.freeze({
    modeKey: openGym ? OPEN_GYM_MODE_KEY : modeKey,
    scoreboard: policy.showScoreboard,
    broadcastBug: false,
    playerCard: policy.showPlayerCard,
    momentum: !openGym,
    controlHints: policy.showControlHints,
    stamina: true,
    pause: true,
    shotMeter: true,
    transientFeedback: true,
  });
}

function setNodeVisible(node, visible) {
  if (!node) return;
  node.hidden = !visible;
  node.classList?.toggle?.("is-hidden", !visible);
  node.setAttribute?.("aria-hidden", String(!visible));
}

export function applyGameplayHudVisibility(root, modeKey) {
  const visibility = gameplayHudVisibilityForMode(modeKey);
  for (const [key, selector] of Object.entries(HUD_SELECTORS)) {
    setNodeVisible(root?.querySelector?.(selector), visibility[key]);
  }
  const app = root?.querySelector?.("#app");
  if (app?.dataset) app.dataset.gameMode = visibility.modeKey || "unknown";
  return visibility;
}
