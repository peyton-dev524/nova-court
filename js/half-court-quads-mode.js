import { HalfCourtThreeOnThreeMode } from "./modes.js";
import { TEAM_FORMAT_IDS } from "./team-formats.js";

/**
 * Four-player half-court rules use the shared possession, clear, assist, and
 * inbound-pass contracts while publishing a dedicated 4v4 identity.
 */
export class HalfCourtQuadsMode extends HalfCourtThreeOnThreeMode {
  constructor(config = {}) {
    super({
      targetScore: 19,
      winBy: 2,
      scoreCap: 25,
      shotClock: 21,
      gameDuration: 330,
      playersPerTeam: 4,
      title: "Nova Fours",
      ...config,
    });
    this.id = TEAM_FORMAT_IDS.QUADS;
  }

  getState() {
    return { ...super.getState(), id: this.id };
  }

  getUIState() {
    return { ...super.getUIState(), id: this.id, title: "Nova Fours" };
  }

  getRules() {
    return { ...super.getRules(), id: this.id, playersPerTeam: 4 };
  }
}

export function createHalfCourtQuadsMode(config) {
  return new HalfCourtQuadsMode(config);
}
