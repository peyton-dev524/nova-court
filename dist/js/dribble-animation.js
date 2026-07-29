export const FEATURED_DRIBBLE_MOVES = Object.freeze(["crossover", "spin"]);

export const DRIBBLE_NAMED_FRAMES = Object.freeze({
  crossover: Object.freeze({ start: 0, carry: 0.28, handoff: 0.5, finish: 1 }),
  spin: Object.freeze({ start: 0, carry: 0.27, handoff: 0.56, finish: 1 }),
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = (value) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};
const mix = (a, b, t) => a + (b - a) * t;

/**
 * Deterministic, unit-scaled choreography for the two reviewed handle moves.
 * Coordinates use the engine's player-local convention: +x right, +y up,
 * +z in front. startHand is +1 for right and -1 for left.
 */
export function sampleFeaturedDribbleMove(move, progress, startHand = 1) {
  const id = FEATURED_DRIBBLE_MOVES.includes(move) ? move : "crossover";
  const p = clamp01(progress);
  const hand = startHand < 0 ? -1 : 1;
  const eased = smooth(p);
  const pulse = Math.sin(Math.PI * p);

  if (id === "spin") {
    const protectedRadius = 0.57 + 0.035 * pulse;
    const ballAngle = Math.PI * eased;
    const spinAngle = hand * Math.PI * 2 * eased;
    const side = hand * protectedRadius * Math.cos(ballAngle);
    const forward = 0.13 - protectedRadius * Math.sin(ballAngle);
    const bounce = Math.cos(Math.PI * p) ** 2;
    const height = 0.34 + 0.5 * bounce;
    const stepWave = hand * Math.sin(Math.PI * 2 * p);

    return Object.freeze({
      move: id,
      progress: p,
      startHand: hand,
      endHand: -hand,
      ball: Object.freeze({ side, height, forward }),
      pose: Object.freeze({
        rootX: hand * 0.16 * smooth(Math.min(1, p / 0.72)),
        rootZ: -0.22 * eased,
        spinAngle,
        torsoYaw: spinAngle,
        torsoLean: hand * 0.055 * pulse,
        crouch: 0.11 * pulse,
        leftHip: -0.12 + 0.26 * stepWave,
        rightHip: -0.12 - 0.26 * stepWave,
        leftKnee: 0.2 + Math.max(0, -stepWave) * 0.34,
        rightKnee: 0.2 + Math.max(0, stepWave) * 0.34,
      }),
      hands: Object.freeze({
        startWeight: 1 - smooth((p - 0.38) / 0.2),
        endWeight: smooth((p - 0.42) / 0.22),
      }),
      diagnostics: Object.freeze({
        protectedRadius: Math.hypot(side, forward - 0.13),
        torsoClearance: Math.hypot(side, forward),
      }),
    });
  }

  const startSide = hand * 0.52;
  const endSide = -startSide;
  const side = mix(startSide, endSide, eased);
  const forward = 0.35 + 0.09 * pulse;
  const bounce = Math.cos(Math.PI * p) ** 2;
  const height = 0.17 + 0.72 * bounce;
  const lateralStep = Math.sin(Math.PI * p);

  return Object.freeze({
    move: id,
    progress: p,
    startHand: hand,
    endHand: -hand,
    ball: Object.freeze({ side, height, forward }),
    pose: Object.freeze({
      rootX: -hand * 0.18 * eased,
      rootZ: -0.08 * pulse,
      spinAngle: 0,
      torsoYaw: -hand * 0.34 * pulse,
      torsoLean: hand * 0.11 * pulse,
      crouch: 0.13 * pulse,
      leftHip: -0.09 + hand * 0.14 * lateralStep,
      rightHip: -0.09 - hand * 0.14 * lateralStep,
      leftKnee: 0.18 + (hand > 0 ? 0.15 : 0.3) * lateralStep,
      rightKnee: 0.18 + (hand > 0 ? 0.3 : 0.15) * lateralStep,
    }),
    hands: Object.freeze({
      startWeight: 1 - smooth((p - 0.34) / 0.25),
      endWeight: smooth((p - 0.42) / 0.24),
    }),
    diagnostics: Object.freeze({
      protectedRadius: Math.hypot(side, forward),
      torsoClearance: Math.abs(side) < 0.18 ? forward : Math.hypot(side, forward),
    }),
  });
}

export function featuredDribbleFrameName(move, progress) {
  const id = FEATURED_DRIBBLE_MOVES.includes(move) ? move : "crossover";
  const frames = DRIBBLE_NAMED_FRAMES[id];
  const p = clamp01(progress);
  return Object.entries(frames).reduce((best, [name, value]) =>
    Math.abs(p - value) < Math.abs(p - best.value) ? { name, value } : best,
  { name: "start", value: frames.start }).name;
}
