import test from "node:test";
import assert from "node:assert/strict";

import {
  createFullCourtFiveOnFiveMode,
  FULL_COURT_PHASES,
} from "../js/full-court-mode.js";

function startLive(config = {}) {
  const mode = createFullCourtFiveOnFiveMode({ inboundDelay: 0.01, ...config });
  mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  mode.update(0.02);
  return mode;
}

test("5v5 opens with an inbound then becomes live", () => {
  const mode = createFullCourtFiveOnFiveMode({ inboundDelay: 0.1 });
  const start = mode.start({ teamIds: ["home", "away"], userTeamId: "home" });
  assert.equal(mode.phase, FULL_COURT_PHASES.INBOUND);
  assert.equal(start.commands[0].fullCourt, true);
  assert.ok(start.commands[0].position.z > 0);
  mode.update(0.1);
  assert.equal(mode.phase, FULL_COURT_PHASES.LIVE);
});

test("full court scoring uses 2 and 3 points", () => {
  const mode = startLive();
  mode.handleEvent("BASKET", { teamId: "home", playerId: "home-ace", isThree: false });
  assert.equal(mode.getState().scores.home, 2);
  mode.update(0.02);
  mode.handleEvent("BASKET", { teamId: "away", playerId: "away-shade", isThree: true });
  assert.equal(mode.getState().scores.away, 3);
});

test("a pass to the scorer is recorded as an assist", () => {
  const mode = startLive();
  mode.handleEvent("PASS_COMPLETE", {
    teamId: "home",
    fromPlayerId: "home-ace",
    toPlayerId: "home-lyric",
  });
  const scored = mode.handleEvent("BASKET", {
    teamId: "home",
    playerId: "home-lyric",
  });
  const confirmation = scored.commands.find((command) => command.type === "SCORE_CONFIRMED");
  assert.equal(confirmation.assistPlayerId, "home-ace");
});

test("defensive rebound starts a live transition without a clear", () => {
  const mode = startLive();
  const response = mode.handleEvent("REBOUND", { teamId: "away", offensive: false });
  assert.equal(mode.phase, FULL_COURT_PHASES.LIVE);
  assert.equal(mode.getState().possessionTeamId, "away");
  assert.equal(response.commands.some((command) => command.type === "SET_POSSESSION" && command.live), true);
});

test("made basket gives opponent a direction-aware baseline inbound", () => {
  const mode = startLive();
  const response = mode.handleEvent("BASKET", { teamId: "home", playerId: "home-ace" });
  const inbound = response.commands.find((command) => command.type === "SET_POSSESSION");
  assert.equal(inbound.teamId, "away");
  assert.ok(inbound.position.z < 0);
});

test("regulation tie enters next-score overtime", () => {
  const mode = startLive({ gameDuration: 0.05 });
  mode.update(0.06);
  assert.equal(mode.getState().overtime, true);
  assert.equal(mode.getState().gameClock, 0);
  mode.handleEvent("BASKET", { teamId: "home", playerId: "home-ace" });
  assert.equal(mode.phase, FULL_COURT_PHASES.FINISHED);
  assert.equal(mode.getState().result.winnerTeamId, "home");
});

