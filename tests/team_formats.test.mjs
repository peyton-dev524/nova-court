import test from "node:test";
import assert from "node:assert/strict";

import {
  TEAM_FORMAT_IDS,
  TEAM_FORMATS,
  attackBasketForTeam,
  createTeamRoster,
  defenseBasketForTeam,
  getAttackBaskets,
  getFormatForModeKey,
  isOutsideCourt,
  restartSpotForTeam,
} from "../js/team-formats.js";

test("team formats expose 2v2, 3v3 and full-court 5v5", () => {
  assert.equal(TEAM_FORMATS[TEAM_FORMAT_IDS.DUOS].playersPerTeam, 2);
  assert.equal(TEAM_FORMATS[TEAM_FORMAT_IDS.TRIOS].playersPerTeam, 3);
  assert.equal(TEAM_FORMATS[TEAM_FORMAT_IDS.FULL_FIVE].playersPerTeam, 5);
  assert.equal(getFormatForModeKey("fives").court.kind, "full");
});

test("5v5 attacks two distinct baskets", () => {
  const home = attackBasketForTeam(TEAM_FORMAT_IDS.FULL_FIVE, "home");
  const away = attackBasketForTeam(TEAM_FORMAT_IDS.FULL_FIVE, "away");
  assert.ok(home.z < 0);
  assert.ok(away.z > 0);
  assert.equal(defenseBasketForTeam(TEAM_FORMAT_IDS.FULL_FIVE, "home"), away);
  assert.deepEqual(getAttackBaskets(TEAM_FORMAT_IDS.FULL_FIVE), {
    home: { ...home },
    away: { ...away },
  });
});

test("original roster includes every basketball position in 5v5", () => {
  const roster = createTeamRoster(TEAM_FORMAT_IDS.FULL_FIVE);
  assert.equal(roster.length, 10);
  for (const team of ["home", "away"]) {
    const teamPlayers = roster.filter((player) => player.team === team);
    assert.deepEqual(teamPlayers.map((player) => player.courtPosition), ["PG", "SG", "SF", "PF", "C"]);
  }
  assert.equal(roster.filter((player) => player.controlled).length, 1);
  assert.ok(roster.every((player) => !/james|curry|nba|2k/i.test(player.name)));
});

test("full court bounds and restart spots are direction aware", () => {
  assert.equal(isOutsideCourt(TEAM_FORMAT_IDS.FULL_FIVE, { x: 0, z: 13.9 }), false);
  assert.equal(isOutsideCourt(TEAM_FORMAT_IDS.FULL_FIVE, { x: 0, z: 14.2 }), true);
  const homeRestart = restartSpotForTeam(TEAM_FORMAT_IDS.FULL_FIVE, "home");
  const awayRestart = restartSpotForTeam(TEAM_FORMAT_IDS.FULL_FIVE, "away");
  assert.ok(homeRestart.z > 0);
  assert.ok(awayRestart.z < 0);
});

test("half-court formats retain shared attack hoop and clear rule", () => {
  for (const id of [TEAM_FORMAT_IDS.DUOS, TEAM_FORMAT_IDS.TRIOS]) {
    assert.equal(attackBasketForTeam(id, "home").z, attackBasketForTeam(id, "away").z);
    assert.equal(TEAM_FORMATS[id].requiresClear, true);
  }
});

