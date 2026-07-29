import nodeTest from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { collectContractScenarios } from "./helpers/contract-scenarios.mjs";

import {
  calculateShotMakePercentage,
  ratingForShotContext,
  shotAttributeForContext,
} from "../js/shot-coverage.js";
import {
  calculateStealMatchupBands,
  resolveLiveBallSteal,
  STEAL_OUTCOMES,
} from "../js/live-ball-duels.js";
import {
  predictReboundLanding,
  rankReboundCandidates,
  scoreReboundCandidate,
} from "../js/contact-rules.js";
import {
  ATTRIBUTE_GROUPS,
  ATTRIBUTE_LABELS,
  POSITION_PRESETS,
  PROFILE_SCHEMA_VERSION,
  createDefaultProfile,
  getEnginePlayerConfig,
  normalizeProfile,
} from "../js/player-progression.js";

const { scenario: test, register } = collectContractScenarios();

test("each shot context selects its named profile attribute and ratings remain monotonic", () => {
  const contexts = [
    [{ shotContext: "jumper", distance: 1.4 }, "closeShot"],
    [{ shotContext: "layup", distance: 1.2, movementSpeed: 2.2 }, "drivingLayup"],
    [{ shotContext: "dunk", distance: 1.1 }, "drivingDunk"],
    [{ shotContext: "jumper", distance: 4.8 }, "midRange"],
    [{ shotContext: "jumper", distance: 6.5 }, "threePoint"],
    [{ shotContext: "free_throw", distance: 4.5 }, "freeThrow"],
  ];
  for (const [context, expected] of contexts) {
    assert.equal(shotAttributeForContext(context), expected);
    assert.equal(ratingForShotContext({ [expected]: 83 }, context).ratingKey, expected);
  }

  for (const [context, ratingKey] of contexts.slice(0, 5)) {
    const input = {
      ...context,
      coverage: 0.28,
      releaseQuality: 0.72,
      ratings: { [ratingKey]: 40 },
      stamina: 0.82,
    };
    const low = calculateShotMakePercentage(input);
    const high = calculateShotMakePercentage({ ...input, ratings: { [ratingKey]: 92 } });
    assert.equal(high.ratingKey, ratingKey);
    assert.ok(high.makeProbability >= low.makeProbability + 0.22, `${ratingKey} delta`);
  }
});

test("perfect user greens remain guaranteed while CPU probability and assist contracts stay bounded", () => {
  const common = {
    coverage: 0.36,
    releaseQuality: 1,
    perfectRelease: true,
    distance: 6.5,
    shotContext: "jumper",
    ratings: { threePoint: 45 },
  };
  const user = calculateShotMakePercentage({ ...common, userControlled: true });
  const cpu = calculateShotMakePercentage({ ...common, isAI: true });
  assert.equal(user.guaranteed, true);
  assert.equal(user.makeProbability, 1);
  assert.equal(cpu.guaranteed, false);
  assert.ok(cpu.makeProbability > 0 && cpu.makeProbability < 1);
});

test("steal, defense, and reaction oppose handle, security, and strength in reproducible bands", () => {
  const common = {
    distance: 0.9,
    alignment: 0.72,
    reachTiming: 0.72,
    ballExposure: 0.65,
    ballFirst: true,
  };
  const eliteDefense = calculateStealMatchupBands({
    ...common,
    steal: 94,
    perimeterDefense: 92,
    reaction: 90,
    ballHandle: 45,
    ballSecurity: 48,
    handlerStrength: 52,
  });
  const secureHandler = calculateStealMatchupBands({
    ...common,
    steal: 42,
    perimeterDefense: 45,
    reaction: 48,
    ballHandle: 94,
    ballSecurity: 92,
    handlerStrength: 88,
  });
  for (const bands of [eliteDefense, secureHandler]) {
    assert.ok(Math.abs(bands.cleanProbability + bands.foulProbability + bands.whiffProbability - 1) < 1e-9);
    assert.ok(bands.cleanProbability >= 0.035 && bands.cleanProbability <= 0.78);
    assert.ok(bands.foulProbability >= 0.025 && bands.foulProbability <= 0.58);
  }
  assert.ok(eliteDefense.cleanProbability > secureHandler.cleanProbability + 0.35);
  assert.ok(eliteDefense.whiffProbability < secureHandler.whiffProbability);
});

test("a clean steal still produces a live deterministic loose ball with no automatic possession", () => {
  const input = {
    owner: {
      id: "handler",
      teamId: "home",
      position: { x: 0, z: 0 },
      velocity: { x: 0.4, z: -0.2 },
      ratings: { ballHandle: 40, ballSecurity: 42, strength: 45 },
    },
    defender: {
      id: "lock",
      teamId: "away",
      position: { x: 0.65, z: 0 },
      velocity: { x: 0, z: 0 },
      ratings: { steal: 96, perimeterDefense: 94, reaction: 93 },
    },
    ball: { position: { x: 0.1, y: 0.8, z: 0 } },
    distance: 0.65,
    alignment: 0.9,
    reachTiming: 0.78,
    ballExposure: 0.9,
    ballFirst: true,
    foulCheckValue: 0.99,
    pokeCheckValue: 0,
    pokeSide: 1,
  };
  const first = resolveLiveBallSteal(input);
  const second = resolveLiveBallSteal(input);
  assert.equal(first.outcome, STEAL_OUTCOMES.LOOSE_BALL);
  assert.equal(first.automaticPossession, false);
  assert.equal(first.looseBall.state, "loose");
  assert.deepEqual(first, second);
});

test("offensive rebound migrates, defaults, caps, labels, OVR, and engine configuration", () => {
  const defaults = createDefaultProfile();
  assert.equal(PROFILE_SCHEMA_VERSION, 7);
  assert.ok(ATTRIBUTE_GROUPS.Defense.includes("offensiveRebound"));
  assert.equal(ATTRIBUTE_LABELS.offensiveRebound, "Offensive rebound");
  for (const [position, preset] of Object.entries(POSITION_PRESETS)) {
    assert.ok(preset.base.offensiveRebound >= 25, position);
    assert.ok(preset.caps.offensiveRebound >= preset.base.offensiveRebound, position);
    assert.ok(preset.weights.offensiveRebound > 0, position);
  }
  const migrated = normalizeProfile({
    version: 6,
    selectedPosition: "PF",
    identity: { shoeColorwayId: "future-colorway" },
    builds: defaults.builds,
  });
  assert.equal(migrated.identity.shoeColorwayId, "future-colorway");
  assert.equal(migrated.builds.PF.attributes.offensiveRebound, POSITION_PRESETS.PF.base.offensiveRebound);
  migrated.builds.PF.attributes.offensiveRebound = 999;
  const capped = normalizeProfile(migrated);
  assert.equal(capped.builds.PF.attributes.offensiveRebound, POSITION_PRESETS.PF.caps.offensiveRebound);
  const config = getEnginePlayerConfig(capped);
  assert.equal(config.offensiveRebound, capped.builds.PF.attributes.offensiveRebound / 100);
  assert.equal(config.defensiveRebound, capped.builds.PF.attributes.defensiveRebound / 100);
});

test("rebound scoring uses the correct side-specific rating plus arrival and physique", () => {
  const context = {
    landingPoint: { x: 0, z: -4.8 },
    rim: { x: 0, z: -5.7 },
    offenseTeamId: "home",
    predictedLandingSeconds: 0.5,
  };
  const candidate = {
    id: "candidate",
    position: { x: 0.3, z: -4.2 },
    velocity: { x: -0.3, z: -1.1 },
    height: 1.96,
    vertical: 70,
    strength: 70,
    offensiveRebound: 42,
    defensiveRebound: 94,
  };
  const offensive = scoreReboundCandidate({ ...candidate, teamId: "home" }, context);
  const defensive = scoreReboundCandidate({ ...candidate, teamId: "away" }, context);
  assert.equal(offensive.breakdown.ratingKey, "offensiveRebound");
  assert.equal(defensive.breakdown.ratingKey, "defensiveRebound");
  assert.ok(defensive.breakdown.rebounding > offensive.breakdown.rebounding);

  const small = scoreReboundCandidate({
    ...candidate,
    teamId: "home",
    offensiveRebound: 70,
    height: 1.75,
    reach: 0.48,
    vertical: 42,
    strength: 42,
  }, context);
  const physical = scoreReboundCandidate({
    ...candidate,
    teamId: "home",
    offensiveRebound: 70,
    height: 2.12,
    reach: 0.96,
    vertical: 92,
    strength: 92,
  }, context);
  assert.ok(physical.score > small.score + 8);
  assert.ok(Number.isFinite(physical.breakdown.arrivalSeconds));
});

test("computed box outs materially penalize opponents and ranking is deterministic, not nearest-only", () => {
  const candidates = [
    {
      id: "inside",
      teamId: "away",
      position: { x: 0, z: -4.65 },
      velocity: { x: 0, z: -0.5 },
      facing: { x: 0, z: 1 },
      defensiveRebound: 88,
      strength: 92,
      height: 2.06,
      vertical: 84,
    },
    {
      id: "boxed",
      teamId: "home",
      position: { x: 0, z: -3.8 },
      velocity: { x: 0, z: -1 },
      facing: { x: 0, z: -1 },
      offensiveRebound: 90,
      strength: 62,
      height: 2.03,
      vertical: 86,
    },
    {
      id: "far-elite",
      teamId: "home",
      position: { x: 1.15, z: -3.9 },
      velocity: { x: -1.7, z: -1.5 },
      facing: { x: -0.5, z: -0.8 },
      offensiveRebound: 99,
      strength: 96,
      height: 2.14,
      vertical: 96,
    },
  ];
  const context = {
    landingPoint: { x: 0, z: -4.9 },
    rim: { x: 0, z: -5.7 },
    offenseTeamId: "home",
    maxPursuitDistance: 3,
    predictedLandingSeconds: 0.55,
  };
  const first = rankReboundCandidates(candidates, context);
  const second = rankReboundCandidates(candidates, context);
  assert.deepEqual(first, second);
  assert.ok(first.find((entry) => entry.playerId === "boxed").breakdown.boxedOutPenalty > 0);
  assert.notEqual(first[0].playerId, "boxed");
  assert.ok(first[0].breakdown.landingDistance > 0);
});

test("landing prediction and production engine wiring remain deterministic", async () => {
  const ball = {
    position: { x: 0.2, y: 2.4, z: -3.8 },
    velocity: { x: 1.2, y: 1.8, z: -2.1 },
  };
  assert.deepEqual(predictReboundLanding(ball, { seconds: 0.4 }), predictReboundLanding(ball, { seconds: 0.4 }));
  const engine = await readFile(new URL("../js/engine.js", import.meta.url), "utf8");
  const lab = await readFile(new URL("../js/attribute-impact-lab.js", import.meta.url), "utf8");
  const build = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(engine, /shotContext:\s*shotContext \|\| this\.shotContext/);
  assert.match(engine, /perimeterDefense: defender\.metadata/);
  assert.match(engine, /predictReboundLanding/);
  assert.match(engine, /offensiveRebound: player\.metadata/);
  assert.match(engine, /rankReboundCandidates\(eligible/);
  assert.match(lab, /__NOVA_ATTRIBUTE_LAB__/);
  assert.match(lab, /snapshot:/);
  assert.match(build, /attribute-impact-lab\.html/);
});

register(nodeTest, "attribute impact and rebound simulation contracts");
