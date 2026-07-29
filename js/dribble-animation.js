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

export function dribbleHandContactWeight({
  ballHeight = 0,
  ballSide = 0,
  armSide = 1,
} = {}) {
  const heightContact = smooth((Number(ballHeight) - 0.45) / 0.35);
  const handCenter = (armSide < 0 ? -1 : 1) * 0.5;
  const ownership = clamp01(1 - Math.abs(Number(ballSide) - handCenter) / 0.72);
  return heightContact * ownership;
}

/**
 * Two-link arm target shared by gameplay and Dribble Lab. Inputs are in the
 * same player-relative, runtime-scaled space as the ball and shoulder anchors.
 * The wrist aims slightly above the ball center so the palm meets its surface.
 */
export function solveDribbleHandContact({
  ball = {},
  shoulder = {},
  scaleY = 1,
  ballRadius = 0.12,
  upperLength = 0.5,
  lowerLength = 0.465,
} = {}) {
  const safeScale = Math.max(0.01, Number(scaleY) || 1);
  const ballX = Number(ball.x ?? ball.side) || 0;
  const ballY = Number(ball.y ?? ball.height) || 0;
  const ballZ = Number(ball.z ?? ball.forward) || 0;
  const shoulderX = Number(shoulder.x) || 0;
  const shoulderY = Number(shoulder.y) || 0;
  const shoulderZ = Number(shoulder.z) || 0;
  const toShoulderX = shoulderX - ballX;
  const toShoulderY = shoulderY - ballY;
  const toShoulderZ = shoulderZ - ballZ;
  const shoulderDistance = Math.max(
    0.001,
    Math.hypot(toShoulderX, toShoulderY, toShoulderZ),
  );
  const contactOffset = Math.max(0, Number(ballRadius) || 0) + 0.015 * safeScale;
  const target = Object.freeze({
    x: ballX + toShoulderX / shoulderDistance * contactOffset,
    y: ballY + toShoulderY / shoulderDistance * contactOffset,
    z: ballZ + toShoulderZ / shoulderDistance * contactOffset,
  });
  const dx = target.x - shoulderX;
  const dy = target.y - shoulderY;
  const dz = target.z - shoulderZ;
  const downward = Math.max(0.12 * safeScale, -dy);
  const pitch = Math.max(-1.58, Math.min(0.35, -Math.atan2(dz, downward)));
  const roll = Math.max(-1.2, Math.min(1.2, Math.atan2(dx, downward)));
  const upper = upperLength * safeScale;
  const lower = lowerLength * safeScale;
  const reach = Math.max(
    Math.abs(upper - lower) + 0.001,
    Math.min(upper + lower - 0.001, Math.hypot(dx, dy, dz)),
  );
  const elbowCos = Math.max(-1, Math.min(
    1,
    (upper * upper + lower * lower - reach * reach) / (2 * upper * lower),
  ));
  return Object.freeze({
    target,
    pitch,
    roll,
    elbow: -(Math.PI - Math.acos(elbowCos)),
    reach,
    contactOffset,
  });
}

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
    const protectedRadius = 0.5 + 0.035 * pulse;
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

  const startSide = hand * 0.46;
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
