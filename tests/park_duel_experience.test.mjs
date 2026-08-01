import assert from "node:assert/strict";
import test from "node:test";
import { createParkDuelExperience } from "../js/park-duel-experience.js";

test("Park Duel introduction contains a redacted scout, setup, rules, and first possession", () => {
  const experience = createParkDuelExperience({ difficulty: "pro", now: () => 1000 });
  experience.reset({ matchId: "night-1", homeName: "Nova Ace", homeOverall: 78, venueId: "montgomery", venueName: "NOVA Park", ball: { id: "classic", name: "Classic Orange" }, targetScore: 11 });
  const intro = experience.getIntro();
  assert.equal(intro.scout.dominantHand, "Left");
  assert.equal(intro.scout.primaryArchetype, "Change Of Pace Creator");
  assert.equal(intro.scout.rating, undefined);
  assert.equal(intro.firstPossession, "NOVA ball / check at the top");
  assert.equal(intro.rules.label, "Street");
  assert.equal(intro.home.name, "Nova Ace");
});

test("completed possessions gradually produce bounded defensive adaptation", () => {
  const experience = createParkDuelExperience({ difficulty: "pro", seed: 8, now: () => 2000 });
  for (let index = 0; index < 5; index += 1) {
    experience.record("dribble", { teamId: "home", move: "crossover", success: true });
    experience.record("shot", { teamId: "home", context: "layup", made: true, quality: 0.8 });
    experience.record("score", { teamId: "home", context: "layup", points: 1 });
  }
  const plan = experience.getSnapshot().adaptation;
  assert.ok(plan.adjustments.crossoverPressure > 0);
  assert.ok(plan.adjustments.paintProtection > 0);
  assert.ok(plan.adjustments.crossoverPressure <= plan.maxAdjustment);
});

test("advanced postgame summary and highlight reel prioritize the game winner", () => {
  let now = 10_000;
  const experience = createParkDuelExperience({ difficulty: "pro", now: () => now });
  experience.reset({ matchId: "night-final", targetScore: 3 });
  experience.record("shot", { teamId: "home", context: "dunk", made: true, quality: 0.95, coverage: 0.4 });
  experience.record("score", { teamId: "home", context: "dunk", points: 1, coverage: 0.4 });
  now += 1000;
  experience.record("block", { teamId: "home", playerId: "ace" });
  now += 1000;
  experience.record("shot", { teamId: "home", isThree: true, made: true, quality: 0.9 });
  experience.record("score", { teamId: "home", points: 2, isThree: true, isLong: true, playerId: "ace" });
  const postgame = experience.getPostgame("win");
  assert.equal(postgame.finalScore.home, 3);
  assert.equal(postgame.reel.clips[0].type, "game-winner");
  assert.equal(postgame.stats.home.attempts, 2);
  assert.ok(postgame.stats.home.contestedPercent > 0);
  assert.equal(postgame.export.schema, "nova-court-highlight/v1");
});

test("quick rematch reset clears match stats while retaining the selected setup", () => {
  const experience = createParkDuelExperience({ now: () => 5000 });
  experience.reset({ matchId: "first", venueId: "arena840", venueName: "Arena 840", ball: { id: "redWhiteBlue", name: "NOVA Tricolor" } });
  experience.record("shot", { teamId: "home", made: false });
  experience.reset({ matchId: "rematch", venueId: "arena840", venueName: "Arena 840", ball: { id: "redWhiteBlue", name: "NOVA Tricolor" } });
  const snapshot = experience.getSnapshot();
  assert.equal(snapshot.matchId, "rematch");
  assert.equal(snapshot.stats.home.attempts, 0);
  assert.equal(snapshot.score.home, 0);
});
