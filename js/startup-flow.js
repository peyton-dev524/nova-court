export const STARTUP_DESTINATIONS = Object.freeze({
  MENU: "menu",
  PLAYER_CREATION: "player-creation",
});

/**
 * Normal launches always enter the title/menu. Player creation is opt-in and
 * only opens directly through the explicit QA/deep-link query.
 */
export function resolveStartupDestination({ forcePlayerCreation = false } = {}) {
  return forcePlayerCreation
    ? STARTUP_DESTINATIONS.PLAYER_CREATION
    : STARTUP_DESTINATIONS.MENU;
}

export function getMyPlayerMenuPresentation(profileSummary = {}) {
  if (profileSummary.needsOnboarding) {
    return Object.freeze({
      action: "CREATE MY PLAYER",
      summary: "OPTIONAL · DEFAULT READY",
      ariaLabel: "Create My Player, optional",
    });
  }
  return Object.freeze({
    action: "MY PLAYER",
    summary: `${profileSummary.displayName} · ${profileSummary.title?.name || "PROSPECT"} · ${profileSummary.overall} OVR`,
    ariaLabel: "Open My Player",
  });
}
