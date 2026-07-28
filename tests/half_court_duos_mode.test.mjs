import test from "node:test";
import assert from "node:assert/strict";

import { createHalfCourtDuosMode } from "../js/half-court-duos-mode.js";
import { TEAM_FORMAT_IDS } from "../js/team-formats.js";

test("duos publishes 2v2 rules and its own mode id", () => {
  const mode = createHalfCourtDuosMode();
  const started = mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  assert.equal(started.state.id, TEAM_FORMAT_IDS.DUOS);
  assert.equal(mode.getRules().playersPerTeam, 2);
  assert.equal(mode.getUIState().title, "Nova Duos");
});

test("duos keeps half-court clear and check flow", () => {
  const mode = createHalfCourtDuosMode({ checkDelay: 0.01 });
  mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  mode.handleEvent("CHECK_COMPLETE", { offenseTeamId: "home" });
  mode.handleEvent("TURNOVER", { teamId: "away" });
  assert.equal(mode.getState().needsClear, true);
  assert.equal(mode.getState().possessionTeamId, "away");
  mode.handleEvent("CLEAR_COMPLETE", { teamId: "away" });
  assert.equal(mode.getState().needsClear, false);
});

