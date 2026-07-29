import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AI_TRACE_LIMIT,
  DIFFICULTY_PRESETS,
  createAIDirector,
  scoreOffensiveCandidates,
} from "../js/ai.js";
import {
  CPU_LAB_RENDER_BUDGET,
  cpuLabWithinRenderBudget,
} from "../js/cpu-lab-budget.js";

const court = { halfWidth: 7.5, halfLength: 7, threePointRadius: 6.15 };
const basket = { x: 0, z: -5.7 };
const tuning = DIFFICULTY_PRESETS.pro;
const player = { id: "handler", position: { x: 0, z: 0 }, shooting: 0.82, stamina: 0.9 };

function scores(overrides = {}) {
  return scoreOffensiveCandidates({
    player, basket, defenderDistance: 2.5, laneScore: 0.6,
    passOption: { score: 0.55 }, shotClock: 12, court, tuning, ...overrides,
  });
}

function snapshot({
  shotClock = 12,
  handler = { x: 0, z: 0 },
  defender = { x: 3.4, z: 0.4 },
  wing = { x: -4.5, z: -0.2 },
} = {}) {
  return {
    players: [
      { id: "handler", teamId: "away", position: handler, hasBall: true, role: "handler", shooting: 0.84, stamina: 0.92, aiEnabled: true },
      { id: "wing", teamId: "away", position: wing, role: "wing", shooting: 0.91, stamina: 1, aiEnabled: true },
      { id: "defender", teamId: "home", position: defender, role: "handler", aiEnabled: false, isHuman: true },
      { id: "help", teamId: "home", position: { x: 3.2, z: -1.4 }, role: "wing", aiEnabled: false, isHuman: true },
    ],
    ball: { holderId: "handler", position: handler, isLoose: false, airborne: false, isShotResolved: true },
    offenseTeamId: "away",
    phase: "live",
    possessionId: 1,
    shotClock,
    attackBaskets: { away: basket, home: { x: 0, z: 5.7 } },
    court,
  };
}

test("candidate scores and choices are deterministic for identical inputs", () => {
  assert.deepEqual(scores(), scores());
});

test("shot utility rises monotonically with openness, shooting rating, and urgency", () => {
  const shot = (result) => result.candidates.find((item) => item.action === "shoot").score;
  assert.ok(shot(scores({ defenderDistance: 4 })) > shot(scores({ defenderDistance: 0.7 })));
  assert.ok(shot(scores({ player: { ...player, shooting: 0.95 } })) > shot(scores({ player: { ...player, shooting: 0.55 } })));
  assert.ok(shot(scores({ shotClock: 2.1 })) > shot(scores({ shotClock: 14 })));
});

test("better teammate expected value selects pass over a hard early contest", () => {
  const result = scores({ defenderDistance: 0.5, laneScore: 0.08, passOption: { score: 0.96 }, shotClock: 14 });
  assert.equal(result.chosen, "pass");
  assert.ok(result.candidates[0].score > result.candidates.find((item) => item.action === "shoot").score);
});

test("late clock forces a legal attempt and an early hard contest does not", () => {
  const badEarly = scores({ defenderDistance: 0.45, laneScore: 0.1, passOption: { score: 0.8 }, shotClock: 16 });
  assert.notEqual(badEarly.chosen, "shoot");
  const late = scores({ defenderDistance: 0.45, laneScore: 0.1, passOption: { score: 0.8 }, shotClock: 1.6 });
  assert.equal(late.chosen, "shoot");
  assert.equal(late.forced, true);
});

test("recent-decision hysteresis reduces repeated action utility", () => {
  const baseline = scores();
  const repeated = scores({ recentAction: "drive", repeatedActionCount: 4 });
  const utility = (result, action) => result.candidates.find((item) => item.action === action).score;
  assert.ok(utility(repeated, "drive") < utility(baseline, "drive"));
  assert.equal(repeated.components.hysteresisPenalty, 0.22);
});

test("corner watchdog exits toward the middle or outlet instead of move spam", () => {
  const director = createAIDirector({ seed: 31, difficulty: "pro", debug: true });
  const trapped = snapshot({ handler: { x: 6.7, z: 6.05 }, defender: { x: 6.2, z: 5.5 }, wing: { x: 1, z: 1.4 } });
  let intent;
  for (let index = 0; index < 14; index++) {
    intent = director.update(0.1, trapped).find((item) => item.playerId === "handler");
  }
  assert.match(intent.debug.decision, /escape corner/);
  assert.ok(intent.move.target.x < 6);
  const trace = director.getDecisionTraces("handler").at(-1);
  assert.ok(trace.watchdog.recoveries >= 1);
});

test("trace schema is bounded and debug-off accumulates nothing", () => {
  const director = createAIDirector({ seed: 5, debug: true });
  for (let index = 0; index < AI_TRACE_LIMIT + 30; index++) director.update(0.1, snapshot());
  const trace = director.getDecisionSnapshot("handler");
  assert.equal(trace.count <= AI_TRACE_LIMIT, true);
  for (const key of ["state", "reason", "candidates", "chosenAction", "rejectedAlternatives", "thresholds", "cooldown", "decisionAge", "shotClock", "target", "face", "watchdog"]) {
    assert.ok(key in trace.latest, key);
  }
  const quiet = createAIDirector({ debug: false });
  quiet.update(0.1, snapshot());
  assert.deepEqual(quiet.getDecisionTraces(), []);
  assert.equal(quiet.getDecisionSnapshot().count, 0);
});

test("CPU lab hook, production renderer integration, build copy, and aiDebug QA hook stay wired", async () => {
  const [html, lab, build, app] = await Promise.all([
    readFile(new URL("../cpu-lab.html", import.meta.url), "utf8"),
    readFile(new URL("../js/cpu-lab.js", import.meta.url), "utf8"),
    readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8"),
    readFile(new URL("../js/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /CPU DECISION LAB/);
  assert.match(lab, /new NovaCourtEngine/);
  assert.match(lab, /__NOVA_CPU_LAB__/);
  assert.match(lab, /setScenario,step,reset/);
  assert.match(build, /cpu-lab\.html/);
  assert.match(app, /qaQuery\.has\("aiDebug"\)/);
  assert.match(app, /getDecisionSnapshot/);
});

test("CPU lab render budget rejects regressions above 180 calls or 100k triangles", () => {
  assert.deepEqual(CPU_LAB_RENDER_BUDGET, { calls: 180, triangles: 100000 });
  assert.equal(cpuLabWithinRenderBudget({ draws: 180, triangles: 100000 }), true);
  assert.equal(cpuLabWithinRenderBudget({ draws: 181, triangles: 99999 }), false);
  assert.equal(cpuLabWithinRenderBudget({ draws: 179, triangles: 100001 }), false);
});
