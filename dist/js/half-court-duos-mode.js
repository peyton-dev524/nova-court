import { HalfCourtThreeOnThreeMode } from "./modes.js";
import { TEAM_FORMAT_IDS } from "./team-formats.js";

/**
 * Two-player half-court rules reuse the proven clear/check/assist controller
 * while publishing an accurate 2v2 identity and defaults.
 */
export class HalfCourtDuosMode extends HalfCourtThreeOnThreeMode {
  constructor(config = {}) {
    super({
      targetScore: 13,
      winBy: 2,
      scoreCap: 19,
      shotClock: 16,
      gameDuration: 240,
      ...config,
    });
    this.id = TEAM_FORMAT_IDS.DUOS;
  }

  getUIState() {
    return {
      ...super.getUIState(),
      id: this.id,
      title: "Nova Duos",
    };
  }

  getRules() {
    return {
      ...super.getRules(),
      id: this.id,
      playersPerTeam: 2,
    };
  }

  getState() {
    return {
      ...super.getState(),
      id: this.id,
    };
  }
}

export function createHalfCourtDuosMode(config) {
  return new HalfCourtDuosMode(config);
}

