import test from "node:test";
import assert from "node:assert/strict";
import {
  DUNK_OUTCOMES,
  DUNK_PHASES,
  DUNK_STYLE_CONFIG,
  DUNK_TYPES,
  evaluateDunkOpportunity,
  getDunkHangState,
  normalizeDunkContext,
  resolveDunkOutcome,
  sampleDunkChoreography,
  scoreDunkStyles,
  selectDunkChoreography,
} from "../js/dunk-choreography.js";

function allFinite(value) {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value && typeof value === "object") return Object.values(value).every(allFinite);
  return true;
}

function flattenNumbers(value, output = []) {
  if (typeof value === "number") output.push(value);
  else if (value && typeof value === "object") {
    for (const child of Object.values(value)) flattenNumbers(child, output);
  }
  return output;
}

test("raw court vectors normalize to deterministic approach metrics", () => {
  const input = {
    playerPosition: { x: 0.5, z: -4.4 },
    rimPosition: { x: 0, z: -5.7 },
    velocity: { x: -1.5, z: -4 },
    stamina: 0.8,
  };
  const first = normalizeDunkContext(input);
  const second = normalizeDunkContext(input);
  assert.deepEqual(first, second);
  assert.ok(first.distance > 1.3 && first.distance < 1.5);
  assert.ok(first.speed > 4.2);
  assert.ok(first.approachAlignment > 0.95);
  assert.equal(Object.isFrozen(first), true);
});

test("selection translates distinct approach contexts into four original finishes", () => {
  const oneHand = selectDunkChoreography({
    distance: 1.15,
    speed: 3.7,
    stamina: 0.58,
    defenderContest: 0.12,
    laneAngle: 0.18,
    finishRating: 0.72,
    vertical: 0.62,
  });
  const twoHand = selectDunkChoreography({
    distance: 0.75,
    speed: 3.1,
    stamina: 0.68,
    defenderContest: 0.72,
    traffic: 0.82,
    strength: 0.94,
    ballSecurity: 0.9,
    laneAngle: 0.08,
  });
  const reverse = selectDunkChoreography({
    distance: 1.05,
    speed: 3.8,
    stamina: 0.78,
    defenderContest: 0.56,
    laneAngle: 1.23,
    finishRating: 0.84,
  });
  const tomahawk = selectDunkChoreography({
    distance: 1.3,
    speed: 6.1,
    stamina: 0.96,
    defenderContest: 0.03,
    traffic: 0,
    laneAngle: 0.02,
    finishRating: 0.9,
    vertical: 0.96,
  });
  assert.equal(oneHand.type, DUNK_TYPES.POWER_ONE_HAND);
  assert.equal(twoHand.type, DUNK_TYPES.POWER_TWO_HAND);
  assert.equal(reverse.type, DUNK_TYPES.REVERSE);
  assert.equal(tomahawk.type, DUNK_TYPES.TOMAHAWK);
  assert.ok([oneHand, twoHand, reverse, tomahawk].every((selection) => selection.eligible));
});

test("style scoring is explainable, bounded, and stable", () => {
  const first = scoreDunkStyles({
    distance: 1.1,
    speed: 4.2,
    laneAngle: -0.7,
    stamina: 0.8,
    defenderContest: 0.4,
  });
  const second = scoreDunkStyles({
    distance: 1.1,
    speed: 4.2,
    laneAngle: -0.7,
    stamina: 0.8,
    defenderContest: 0.4,
  });
  assert.deepEqual(first, second);
  assert.equal(first.ranked.length, 4);
  assert.ok(first.ranked.every((entry, index, array) =>
    index === 0 || array[index - 1].score >= entry.score));
  assert.ok(allFinite(first));
});

test("all choreography styles have smooth finite normalized samples", () => {
  for (const type of Object.values(DUNK_TYPES)) {
    const selection = Object.freeze({
      type,
      eligible: true,
      finishHand: 1,
      takeoffFoot: -1,
      context: normalizeDunkContext({
        distance: 1.1,
        speed: 4.4,
        laneAngle: 0.3,
        stamina: 0.8,
        vertical: 0.8,
      }),
    });
    let previous = sampleDunkChoreography(selection, 0);
    assert.equal(previous.phase, DUNK_PHASES.APPROACH);
    assert.equal(previous.root.height, 0);
    for (let step = 1; step <= 200; step += 1) {
      const pose = sampleDunkChoreography(selection, step / 200);
      assert.ok(allFinite(pose), `${type} finite at ${step}`);
      assert.ok(pose.progress >= 0 && pose.progress <= 1);
      assert.ok(pose.root.height >= 0);
      assert.ok(pose.ball.height >= 0.72);
      assert.ok(pose.ball.control >= 0 && pose.ball.control <= 1);
      const priorNumbers = flattenNumbers(previous);
      const numbers = flattenNumbers(pose);
      const maxDelta = Math.max(...numbers.map((value, index) =>
        Math.abs(value - (priorNumbers[index] ?? value))));
      assert.ok(maxDelta < 0.22, `${type} discontinuity ${maxDelta} at ${step}`);
      previous = pose;
    }
    assert.equal(previous.phase, DUNK_PHASES.LAND);
    assert.ok(previous.signals.landing > 0.99);
  }
});

test("finish hand and reverse rotation mirror cleanly across the lane", () => {
  const right = selectDunkChoreography({
    distance: 1,
    speed: 4,
    stamina: 0.85,
    laneAngle: 1.2,
    defenderContest: 0.5,
  });
  const left = selectDunkChoreography({
    distance: 1,
    speed: 4,
    stamina: 0.85,
    laneAngle: -1.2,
    defenderContest: 0.5,
  });
  assert.equal(right.type, DUNK_TYPES.REVERSE);
  assert.equal(left.type, DUNK_TYPES.REVERSE);
  assert.equal(right.finishHand, -left.finishHand);
  const rightPose = sampleDunkChoreography(right, 0.62);
  const leftPose = sampleDunkChoreography(left, 0.62);
  assert.ok(Math.abs(rightPose.root.turn + leftPose.root.turn) < 1e-10);
  assert.ok(Math.abs(rightPose.ball.side + leftPose.ball.side) < 1e-10);
});

test("direct style sampling preserves each style's hand contract", () => {
  const context = { laneAngle: 0.8, stamina: 0.8, distance: 1, speed: 4 };
  const twoHand = sampleDunkChoreography(DUNK_TYPES.POWER_TWO_HAND, 0.7, context);
  const reverse = sampleDunkChoreography(DUNK_TYPES.REVERSE, 0.7, context);
  assert.ok(twoHand.rim.gripLeft > 0);
  assert.ok(twoHand.rim.gripRight > 0);
  assert.ok(reverse.rim.gripLeft > 0);
  assert.equal(reverse.rim.gripRight, 0);
});

test("outcome resolver exposes deterministic make hooks", () => {
  const selection = selectDunkChoreography({
    distance: 1,
    speed: 4.2,
    stamina: 0.9,
    defenderContest: 0.08,
    finishRating: 0.9,
    vertical: 0.85,
  });
  const first = resolveDunkOutcome(selection, {
    executionQuality: 0.94,
    rimAlignment: 0.96,
    blockTiming: 0,
    contact: 0.05,
  });
  const second = resolveDunkOutcome(selection, {
    executionQuality: 0.94,
    rimAlignment: 0.96,
    blockTiming: 0,
    contact: 0.05,
  });
  assert.deepEqual(first, second);
  assert.equal(first.outcome, DUNK_OUTCOMES.MADE);
  assert.equal(first.event.type, "DUNK_MADE");
  assert.equal(first.ball.forceThroughRim, true);
  assert.equal(first.hooks.score, true);
  assert.equal(first.hooks.reboundLive, false);
});

test("well-timed strong contest produces a live-ball blocked hook", () => {
  const selection = selectDunkChoreography({
    distance: 1.2,
    speed: 4.5,
    stamina: 0.72,
    defenderContest: 0.94,
    traffic: 0.9,
    finishRating: 0.65,
    ballSecurity: 0.45,
  });
  const result = resolveDunkOutcome(selection, {
    executionQuality: 0.6,
    rimAlignment: 0.72,
    defenderContest: 1,
    blockTiming: 1,
    defenderBlockRating: 0.98,
    contact: 0.8,
    defenderSide: -1,
  });
  assert.equal(result.outcome, DUNK_OUTCOMES.BLOCKED);
  assert.equal(result.event.type, "DUNK_BLOCKED");
  assert.equal(result.hooks.cancelHang, true);
  assert.equal(result.hooks.reboundLive, true);
  assert.equal(result.ball.canScore, false);
  assert.ok(allFinite(result.ball.deflection));
});

test("poor execution misses without incorrectly crediting a block", () => {
  const selection = selectDunkChoreography({
    distance: 1.55,
    speed: 2.2,
    stamina: 0.25,
    defenderContest: 0.1,
    finishRating: 0.35,
    vertical: 0.4,
  });
  const result = resolveDunkOutcome(selection, {
    executionQuality: 0.08,
    rimAlignment: 0.18,
    blockTiming: 0,
  });
  assert.equal(result.outcome, DUNK_OUTCOMES.MISSED);
  assert.equal(result.event.type, "DUNK_MISSED");
  assert.equal(result.hooks.score, false);
  assert.equal(result.hooks.reboundLive, true);
});

test("hang safety prevents blocked grips and releases after the safe window", () => {
  const selection = selectDunkChoreography({
    distance: 0.9,
    speed: 4,
    stamina: 0.8,
    defenderContest: 0.1,
    strength: 0.9,
    traffic: 0.5,
  });
  const rimProgress = DUNK_STYLE_CONFIG[selection.type].milestones.release;
  const safe = getDunkHangState(selection, rimProgress, {
    outcome: DUNK_OUTCOMES.MADE,
    elapsedHangSeconds: 0.08,
    rimDistance: 0.1,
    verticalVelocity: -0.4,
    stamina: 0.8,
  });
  const blocked = getDunkHangState(selection, rimProgress, {
    outcome: DUNK_OUTCOMES.BLOCKED,
    elapsedHangSeconds: 0,
    rimDistance: 0.08,
  });
  const expired = getDunkHangState(selection, rimProgress, {
    outcome: DUNK_OUTCOMES.MADE,
    elapsedHangSeconds: 0.8,
    rimDistance: 0.1,
  });
  assert.equal(safe.canGrip, true);
  assert.ok(safe.gripHands >= 1);
  assert.equal(blocked.canGrip, false);
  assert.equal(blocked.mustRelease, true);
  assert.equal(expired.mustRelease, true);
});

test("landing obstruction extends only the safety hang window", () => {
  const clear = getDunkHangState(DUNK_TYPES.POWER_ONE_HAND, 0.72, {
    elapsedHangSeconds: 0.3,
    landingObstructed: false,
    rimDistance: 0.1,
  });
  const obstructed = getDunkHangState(DUNK_TYPES.POWER_ONE_HAND, 0.72, {
    elapsedHangSeconds: 0.3,
    landingObstructed: true,
    rimDistance: 0.1,
  });
  assert.equal(clear.mustRelease, true);
  assert.equal(obstructed.mustRelease, false);
  assert.equal(obstructed.safetyHold, true);
  assert.ok(obstructed.maxHangSeconds > clear.maxHangSeconds);
});

test("AI suitability attacks an open runway and rejects unsafe attempts", () => {
  const open = evaluateDunkOpportunity({
    distance: 1.15,
    speed: 5,
    stamina: 0.9,
    defenderContest: 0.08,
    finishRating: 0.86,
    vertical: 0.85,
    strength: 0.8,
    ballSecurity: 0.85,
  });
  const far = evaluateDunkOpportunity({
    distance: 3.2,
    speed: 5,
    stamina: 0.9,
    defenderContest: 0,
    finishRating: 0.95,
  });
  const exhausted = evaluateDunkOpportunity({
    distance: 1,
    speed: 4,
    stamina: 0.08,
    defenderContest: 0,
    finishRating: 0.9,
  });
  const smothered = evaluateDunkOpportunity({
    distance: 1,
    speed: 3,
    stamina: 0.6,
    defenderContest: 1,
    traffic: 1,
    defenderBlockRating: 1,
    finishRating: 0.55,
    ballSecurity: 0.35,
  });
  assert.equal(open.shouldAttempt, true);
  assert.equal(open.alternative, "dunk");
  assert.equal(far.shouldAttempt, false);
  assert.equal(far.reason, "too_far");
  assert.equal(exhausted.shouldAttempt, false);
  assert.equal(exhausted.reason, "low_stamina");
  assert.equal(smothered.shouldAttempt, false);
  assert.ok(["layup", "pull_up"].includes(smothered.alternative));
});

test("selection refuses backwards momentum and non-dunking players", () => {
  const backwards = selectDunkChoreography({
    playerPosition: { x: 0, z: -4.6 },
    rimPosition: { x: 0, z: -5.7 },
    velocity: { x: 0, z: 4 },
    stamina: 1,
    finishRating: 1,
  });
  const disabled = selectDunkChoreography({
    distance: 1,
    speed: 5,
    stamina: 1,
    finishRating: 1,
    canDunk: false,
  });
  assert.equal(backwards.eligible, false);
  assert.equal(backwards.reason, "moving_away_from_rim");
  assert.equal(disabled.eligible, false);
});
