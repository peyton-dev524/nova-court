const COMPETITIVE_MODES = new Set(["street", "duos", "team", "quads", "fives"]);

export function getGameplayHudPolicy(modeKey) {
  const mode = String(modeKey || "street");
  return Object.freeze({
    mode,
    competitive: COMPETITIVE_MODES.has(mode),
    showScoreboard: mode !== "practice",
    showPlayerCard: mode !== "threePoint" && mode !== "practice",
    showRackTracker: mode === "threePoint",
    showControlHints: false,
  });
}

export function getPlayerCardContent(modeKey, owner) {
  const policy = getGameplayHudPolicy(modeKey);
  if (!policy.showPlayerCard) {
    return Object.freeze({ hidden: true, name: "", meta: "", team: "neutral" });
  }
  if (!owner) {
    return Object.freeze({
      hidden: false,
      name: "LOOSE BALL",
      meta: "LIVE BALL · CRASH THE GLASS",
      team: "neutral",
    });
  }
  const control = owner.controlled ? "USER CONTROL" : "CPU";
  const state = String(owner.state || "LIVE").replaceAll("_", " ").toUpperCase();
  return Object.freeze({
    hidden: false,
    name: owner.name || "PLAYER",
    meta: `${control} · ${state}`,
    team: owner.team || "neutral",
  });
}
