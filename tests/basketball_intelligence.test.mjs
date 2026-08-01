import test from "node:test";
import assert from "node:assert/strict";

import {
  ADAPTATION_OBSERVATIONS,
  ARCHETYPE_PRESETS,
  CHEMISTRY_EVENTS,
  DIFFICULTY_PROFILES,
  FOUL_PRESET_IDS,
  FOUL_RULE_PRESETS,
  POSITION_COMPATIBILITY,
  TENDENCY_IDS,
  applyBehaviorProfile,
  buildOpponentScout,
  createAdaptiveDefense,
  createBehaviorProfile,
  createChemistryTracker,
  createCrowdCue,
  deriveGameStateSignals,
  evaluateFoulCall,
  getFoulPreset,
  planSubstitutions,
  positionCompatibility,
  substitutionPolicy,
} from "../js/basketball-intelligence.js";

test("pregame scouting exposes seven useful labels and redacts raw ratings", () => {
  const scout = buildOpponentScout({
    dominantHand: "left",
    attributes: { shooting: 96, finishing: 82, secretClutch: 99 },
    defensiveRatings: { perimeterDefense: 80, closeout: 42, hiddenIQ: 12 },
    scoringZones: { rim: 0.4, corner_three: 0.82 },
    recentGames: [{ won: true }, { won: true }, { won: false }, { won: true }, { won: true }],
    archetype: "isolation_creator",
    moveTendencies: { crossover: 0.2, stepback: 0.9 },
    hiddenOverall: 98,
  });

  assert.deepEqual(Object.keys(scout), [
    "preferredScoringArea",
    "dominantHand",
    "strongestAttribute",
    "defensiveWeakness",
    "recentRecord",
    "primaryArchetype",
    "favoriteMove",
  ]);
  assert.equal(scout.preferredScoringArea, "Corner three");
  assert.equal(scout.dominantHand, "Left");
  assert.equal(scout.strongestAttribute, "Shot Making");
  assert.equal(scout.defensiveWeakness, "Late closing to shooters");
  assert.equal(scout.recentRecord, "4-1 Â· W2");
  assert.equal(scout.primaryArchetype, "Isolation Creator");
  assert.equal(scout.favoriteMove, "Stepback");
  assert.doesNotMatch(JSON.stringify(scout), /96|98|secretClutch|hiddenOverall|hiddenIQ/);
  assert.equal(Object.isFrozen(scout), true);
});

test("adaptive defense learns repeated behavior gradually and remains bounded", () => {
  const defense = createAdaptiveDefense({ difficulty: "pro", seed: 44 });
  const first = defense.observePossession([
    { type: "crossover", success: true },
    { type: "drive", success: true },
    { type: "pass_fake", success: true },
  ]);
  assert.equal(first.adjustments.crossoverPressure, 0);
  assert.equal(first.adjustments.paintProtection, 0);
  assert.equal(first.adjustments.passFakeDiscipline, 0);

  let plan;
  for (let possession = 0; possession < 5; possession += 1) {
    plan = defense.observePossession([
      { action: "crossover", success: true },
      { action: "drive", success: true },
      { action: "pass_fake", success: true },
    ]);
  }
  assert.ok(plan.adjustments.crossoverPressure > 0);
  assert.ok(plan.adjustments.paintProtection > 0);
  assert.ok(plan.adjustments.passFakeDiscipline > 0);
  assert.ok(plan.recommendations.includes("shade_repeated_crossover"));
  for (const amount of Object.values(plan.adjustments)) {
    assert.ok(amount >= 0 && amount <= plan.maxAdjustment);
  }
});

test("made threes, poor shooting, matchup failures, decay, and bounded history are explicit", () => {
  const makes = createAdaptiveDefense({ difficulty: "legend", seed: 9 });
  makes.observePossession([{ type: "three", outcome: "made" }]);
  const closeout = makes.observePossession([{ type: "three", outcome: "made" }]);
  assert.ok(closeout.adjustments.threePointCloseout > 0);
  assert.equal(closeout.adjustments.shooterGap, 0);

  const misses = createAdaptiveDefense({ difficulty: "street", seed: 9 });
  for (let index = 0; index < 4; index += 1) {
    misses.observePossession([{ type: "three_point_shot", outcome: "miss" }]);
  }
  assert.ok(misses.getPlan().adjustments.shooterGap > 0);
  assert.ok(misses.getPlan().recommendations.includes("give_poor_shooter_space"));

  const matchup = createAdaptiveDefense({ difficulty: "pro", seed: 11, historyLimit: 3 });
  const switchPlan = matchup.observePossession([
    { type: ADAPTATION_OBSERVATIONS.MATCHUP_LOSS, defenderId: "shade" },
    { type: "matchup_loss", defenderId: "shade" },
    { type: "matchup_loss", defenderId: "shade" },
    { type: "matchup_loss", defenderId: "shade" },
  ], {
    availableDefenders: [
      { id: "shade", defense: 0.6 },
      { id: "lock", defense: 0.92 },
      { id: "wing", defense: 0.76 },
    ],
  });
  assert.equal(switchPlan.switchDefender.recommended, true);
  assert.equal(switchPlan.switchDefender.fromDefenderId, "shade");
  assert.equal(switchPlan.switchDefender.toDefenderId, "lock");

  for (let index = 0; index < 16; index += 1) matchup.observePossession([]);
  assert.equal(matchup.getSnapshot().history.length, 3);
  assert.equal(matchup.getPlan().switchDefender.recommended, false);
});

test("difficulty scales learning ceilings while exposing honest mistake rates", () => {
  assert.ok(DIFFICULTY_PROFILES.rookie.maxAdjustment < DIFFICULTY_PROFILES.legend.maxAdjustment);
  assert.ok(DIFFICULTY_PROFILES.rookie.mistakeRate > DIFFICULTY_PROFILES.legend.mistakeRate);
  const rookie = createAdaptiveDefense({ difficulty: "rookie", seed: 2 });
  const legend = createAdaptiveDefense({ difficulty: "legend", seed: 2 });
  const observations = Array.from({ length: 8 }, () => ({ type: "drive" }));
  const rookiePlan = rookie.observePossession(observations);
  const legendPlan = legend.observePossession(observations);
  assert.ok(legendPlan.adjustments.paintProtection > rookiePlan.adjustments.paintProtection);
  assert.equal(rookiePlan.mistakeRate, 0.34);
  assert.equal(legendPlan.mistakeRate, 0.08);
});

test("all five foul presets disclose their actual rules and call different contact honestly", () => {
  assert.deepEqual(Object.keys(FOUL_RULE_PRESETS), Object.values(FOUL_PRESET_IDS));
  for (const id of Object.values(FOUL_PRESET_IDS)) {
    const preset = getFoulPreset(id);
    assert.equal(preset.id, id);
    assert.ok(preset.label.length > 0);
    assert.ok(preset.summary.length > 0);
  }

  const clearShootingFoul = { type: "shooting", isFoul: true, shooting: true, severity: 0.68 };
  assert.equal(evaluateFoulCall(clearShootingFoul, FOUL_PRESET_IDS.SIMULATION).called, true);
  assert.equal(evaluateFoulCall(clearShootingFoul, FOUL_PRESET_IDS.STREET).called, true);
  assert.equal(evaluateFoulCall(clearShootingFoul, FOUL_PRESET_IDS.NO_BLOOD_NO_FOUL).called, false);
  assert.equal(evaluateFoulCall(clearShootingFoul, FOUL_PRESET_IDS.SHOOTING_LAB).reason, "fouls_disabled");

  const marginal = { type: "reach_in", isFoul: true, severity: 0.64 };
  assert.equal(evaluateFoulCall(marginal, FOUL_PRESET_IDS.COMPETITIVE).called, false);
  assert.equal(evaluateFoulCall({ ...marginal, obvious: true }, FOUL_PRESET_IDS.COMPETITIVE).called, true);
});

test("street substitutions stay disabled and organized rotations remain position-safe", () => {
  assert.equal(substitutionPolicy("park_duel").enabled, false);
  assert.equal(substitutionPolicy("half_court_3v3").enabled, false);
  assert.equal(substitutionPolicy("full_five").enabled, true);
  assert.ok(POSITION_COMPATIBILITY.PF.C > 0);
  assert.equal(positionCompatibility({ courtPosition: "PG" }, "C"), 0);

  const park = planSubstitutions({
    mode: { id: "park_duel", playersPerTeam: 1 },
    lineup: [{ id: "ace", courtPosition: "PG", fatigue: 1 }],
    bench: [{ id: "reserve", courtPosition: "PG", fatigue: 0 }],
  });
  assert.equal(park.enabled, false);
  assert.equal(park.substitutions.length, 0);

  const rotation = planSubstitutions({
    mode: { id: "full_five", playersPerTeam: 5 },
    lineup: [
      { id: "pg", courtPosition: "PG", fatigue: 0.1 },
      { id: "sg", courtPosition: "SG", fatigue: 0.1 },
      { id: "sf", courtPosition: "SF", fatigue: 0.1 },
      { id: "pf", courtPosition: "PF", fatigue: 0.1 },
      { id: "center", courtPosition: "C", fatigue: 0.94 },
    ],
    bench: [
      { id: "bench-pg", courtPosition: "PG", fatigue: 0 },
      { id: "bench-big", eligiblePositions: ["PF", "C"], fatigue: 0.15 },
    ],
  });
  assert.deepEqual(rotation.substitutions.map((change) => [change.outPlayerId, change.inPlayerId]), [
    ["center", "bench-big"],
  ]);
  assert.equal(rotation.nextLineup.find((player) => player.lineupPosition === "C").id, "bench-big");

  const rejected = planSubstitutions({
    mode: { id: "full_five", playersPerTeam: 5 },
    lineup: [{ id: "center", courtPosition: "C", fatigue: 0 }],
    bench: [{ id: "tiny", courtPosition: "PG", fatigue: 0 }],
    manualRequests: [{ outPlayerId: "center", inPlayerId: "tiny" }],
  });
  assert.equal(rejected.substitutions.length, 0);
  assert.equal(rejected.rejected[0].reason, "invalid_or_position_incompatible");
});

test("timeout presets, starter/reserve roles, and multiple changes are supported", () => {
  const result = planSubstitutions({
    mode: { id: "organized_5v5", playersPerTeam: 5 },
    trigger: "timeout",
    lineupPreset: "starters",
    lineup: [
      { id: "reserve-pg", courtPosition: "PG", rosterRole: "reserve" },
      { id: "reserve-c", courtPosition: "C", rosterRole: "reserve" },
    ],
    bench: [
      { id: "starter-pg", courtPosition: "PG", rosterRole: "starter" },
      { id: "starter-c", courtPosition: "C", rosterRole: "starter" },
    ],
  });
  assert.equal(result.substitutions.length, 2);
  assert.deepEqual(result.nextLineup.map((player) => player.id), ["starter-pg", "starter-c"]);
  assert.ok(result.substitutions.every((change) => change.reason === "timeout_starters"));
});

test("chemistry grows through teamwork, decays, and can never overpower skill", () => {
  assert.deepEqual(Object.keys(CHEMISTRY_EVENTS), [
    "assist", "screen", "defensive_help", "good_spacing", "successful_rotation", "win",
  ]);
  const chemistry = createChemistryTracker({ maxBonus: 0.2 });
  for (let index = 0; index < 30; index += 1) {
    chemistry.recordEvent("assist", { playerIds: ["ace", "nova"] });
    chemistry.recordEvent("screen", { playerIds: ["ace", "nova"] });
  }
  const peak = chemistry.getPair("nova", "ace");
  assert.equal(peak.bond, 1);
  assert.equal(peak.maxBonus, 0.05);
  assert.equal(peak.bonus, 0.05);
  chemistry.decay(10);
  assert.ok(chemistry.getPair("ace", "nova").bonus < peak.bonus);
  assert.equal(chemistry.recordEvent("unknown", { playerIds: ["ace", "nova"] }).pairs["ace::nova"] > 0, true);
});

test("archetypes create bounded behavioral differences for identical base ratings", () => {
  assert.equal(Object.keys(ARCHETYPE_PRESETS).length >= 6, true);
  assert.equal(Object.values(TENDENCY_IDS).length, 9);
  const choices = [
    { action: "pass", score: 0.5 },
    { action: "isolation", score: 0.5 },
    { action: "shoot", score: 0.49 },
  ];
  const creator = applyBehaviorProfile(choices, createBehaviorProfile({ archetype: "isolation_creator" }));
  const general = applyBehaviorProfile(choices, createBehaviorProfile({ archetype: "floor_general" }));
  assert.equal(creator.chosen, "isolation");
  assert.equal(general.chosen, "pass");
  for (const result of [creator, general]) {
    for (const candidate of result.candidates) {
      assert.ok(candidate.tendencyBias >= -0.16 && candidate.tendencyBias <= 0.16);
      assert.ok(candidate.score >= 0 && candidate.score <= 1);
    }
  }
});

test("game-state and crowd cues cover clutch moments without synchronized spectators", () => {
  const state = deriveGameStateSignals({
    homeScore: 20,
    awayScore: 19,
    targetScore: 21,
    scoringRun: 6,
    scoringRunTeamId: "home",
    possessionTeamId: "away",
  });
  assert.equal(state.gamePoint, true);
  assert.equal(state.closeGame, true);
  assert.deepEqual(state.gamePointTeams, ["home"]);
  assert.ok(state.intensity > 0.75);

  const cue = createCrowdCue({ type: "ankle_breaker", id: "play-18" }, state, {
    seed: 22,
    sectionCount: 8,
  });
  const repeat = createCrowdCue({ type: "ankle_breaker", id: "play-18" }, state, {
    seed: 22,
    sectionCount: 8,
  });
  assert.deepEqual(cue, repeat);
  assert.equal(cue.reaction, "gasp_then_roar");
  assert.ok(cue.activeSections.length < 8);
  assert.ok(cue.inactiveSectionCount >= 1);
  assert.ok(new Set(cue.staggerMs.map((entry) => entry.delayMs)).size > 1);
  assert.equal(createCrowdCue({ type: "ordinary_dribble" }, state), null);
});
