const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));

// The production rig is authored at this local-space crown-to-outsole height.
// Runtime height scaling maps it to the player's stature in metres.
export const PLAYER_RIG_HEIGHT_LOCAL = 2.722;

export const PLAYER_LEG_PROPORTIONS = Object.freeze({
  thigh: Object.freeze({
    radius: 0.09,
    capsuleLength: 0.375,
    centerY: -0.305,
  }),
  knee: Object.freeze({
    radius: 0.072,
    scale: Object.freeze([0.82, 0.55, 0.76]),
  }),
  calf: Object.freeze({
    radius: 0.068,
  }),
  // A modest width response prevents a tall custom player from becoming
  // uniformly bulky while retaining enough mass for collision readability.
  statureWidth: Object.freeze({
    referenceM: 1.9,
    base: 0.86,
    response: 0.14,
  }),
});

export function playerRigScaleForHeight(heightM = 1.9) {
  const safeHeight = clamp(heightM, 1.5, 2.3);
  const statureRatio = safeHeight / PLAYER_LEG_PROPORTIONS.statureWidth.referenceM;
  const widthScale = PLAYER_LEG_PROPORTIONS.statureWidth.base
    + PLAYER_LEG_PROPORTIONS.statureWidth.response * statureRatio;
  return Object.freeze({
    x: widthScale * 0.96,
    y: safeHeight / PLAYER_RIG_HEIGHT_LOCAL,
    z: widthScale * 0.96,
  });
}

// Anthropometric anchors:
// - NCSU/1988 U.S. Army survey means: hand length 18.05 cm female /
//   19.38 cm male; breadth 7.94 cm female / 9.04 cm male.
// - DiDomenico & Nussbaum (2003), n=100: pooled hand length 18.0 cm,
//   breadth 8.3 cm, stature 173.2 cm.
// The game uses the pooled ratios, not sex-specific sizing, and normalizes
// them to the stylized rig height so height customization scales naturally.
export const HAND_ANTHROPOMETRY = Object.freeze({
  sourceHandLengthM: 0.18,
  sourceHandBreadthM: 0.083,
  sourceStatureM: 1.732,
  lengthToStature: 0.18 / 1.732,
  breadthToLength: 0.083 / 0.18,
  palmLengthShare: 0.54,
  palmDepthToBreadth: 0.36,
  fingerLengthShares: Object.freeze({
    index: 0.43,
    middle: 0.46,
    ring: 0.44,
    little: 0.34,
    thumb: 0.36,
  }),
  fingerRadiusShares: Object.freeze({
    index: 0.086,
    middle: 0.09,
    ring: 0.086,
    little: 0.068,
    thumb: 0.102,
  }),
  thumbOppositionDegrees: 54,
});

export function calculateHandDimensions(rigHeightLocal = PLAYER_RIG_HEIGHT_LOCAL) {
  const handLength = rigHeightLocal * HAND_ANTHROPOMETRY.lengthToStature;
  const handBreadth = handLength * HAND_ANTHROPOMETRY.breadthToLength;
  const palmLength = handLength * HAND_ANTHROPOMETRY.palmLengthShare;
  const palmDepth = handBreadth * HAND_ANTHROPOMETRY.palmDepthToBreadth;
  const fingers = Object.fromEntries(Object.entries(HAND_ANTHROPOMETRY.fingerLengthShares)
    .map(([id, share]) => [id, Object.freeze({
      length: handLength * share,
      baseRadius: handBreadth * HAND_ANTHROPOMETRY.fingerRadiusShares[id],
      tipRadius: handBreadth * HAND_ANTHROPOMETRY.fingerRadiusShares[id] * 0.72,
    })]));
  return Object.freeze({
    handLength,
    handBreadth,
    palmLength,
    palmDepth,
    fingers: Object.freeze(fingers),
    wristOverlap: handLength * 0.055,
  });
}

const DIGIT_LAYOUT = Object.freeze([
  Object.freeze({ id: "index", xShare: 0.29, splayDegrees: 4 }),
  Object.freeze({ id: "middle", xShare: 0.095, splayDegrees: 1 }),
  Object.freeze({ id: "ring", xShare: -0.13, splayDegrees: -2 }),
  Object.freeze({ id: "little", xShare: -0.34, splayDegrees: -7 }),
]);

function createTaperedDigit(T, {
  id,
  length,
  baseRadius,
  tipRadius,
  bendRadians = 0.08,
}) {
  const root = new T.Group();
  root.name = id;
  const proximalLength = length * 0.57;
  const distalLength = length - proximalLength;
  const proximal = new T.Mesh(
    new T.CapsuleGeometry(
      baseRadius,
      Math.max(0.002, proximalLength - baseRadius * 2),
      2,
      6,
    ),
  );
  proximal.name = `${id}-proximal`;
  proximal.position.y = -proximalLength / 2;
  root.add(proximal);

  const distalPivot = new T.Group();
  distalPivot.name = `${id}-distal-pivot`;
  distalPivot.position.y = -proximalLength;
  distalPivot.rotation.x = bendRadians;
  root.add(distalPivot);
  const distal = new T.Mesh(
    new T.CapsuleGeometry(
      tipRadius,
      Math.max(0.002, distalLength - tipRadius * 2),
      2,
      6,
    ),
  );
  distal.name = `${id}-distal`;
  distal.position.y = -distalLength / 2;
  distalPivot.add(distal);
  return { root, proximal, distal, distalPivot };
}

export function createProceduralHand(T, {
  side = 1,
  material,
  rigHeightLocal = PLAYER_RIG_HEIGHT_LOCAL,
} = {}) {
  if (!T) throw new Error("createProceduralHand requires THREE.");
  const handedSide = side < 0 ? -1 : 1;
  const dimensions = calculateHandDimensions(rigHeightLocal);
  const root = new T.Group();
  root.name = handedSide > 0 ? "left-hand" : "right-hand";

  const palmRadius = dimensions.handBreadth * 0.42;
  const palm = new T.Mesh(
    new T.CapsuleGeometry(
      palmRadius,
      Math.max(0.002, dimensions.palmLength - palmRadius * 2),
      3,
      8,
    ),
    material,
  );
  palm.name = `${root.name}-palm`;
  palm.scale.set(
    dimensions.handBreadth / (palmRadius * 2),
    1,
    dimensions.palmDepth / (palmRadius * 2),
  );
  root.add(palm);

  const digits = {};
  const fingerBaseY = -dimensions.palmLength / 2 + dimensions.handLength * 0.012;
  for (const layout of DIGIT_LAYOUT) {
    const values = dimensions.fingers[layout.id];
    const digit = createTaperedDigit(T, {
      id: layout.id,
      ...values,
      bendRadians: layout.id === "little" ? 0.12 : 0.075,
    });
    digit.root.position.set(
      handedSide * dimensions.handBreadth * layout.xShare,
      fingerBaseY,
      dimensions.palmDepth * 0.055,
    );
    digit.root.rotation.z = handedSide * layout.splayDegrees * Math.PI / 180;
    digit.proximal.material = material;
    digit.distal.material = material;
    root.add(digit.root);
    digits[layout.id] = digit;
  }

  const thumbValues = dimensions.fingers.thumb;
  const thumb = createTaperedDigit(T, {
    id: "thumb",
    ...thumbValues,
    bendRadians: 0.18,
  });
  thumb.root.position.set(
    handedSide * dimensions.handBreadth * 0.48,
    dimensions.palmLength * 0.08,
    dimensions.palmDepth * 0.08,
  );
  thumb.root.rotation.z = handedSide * HAND_ANTHROPOMETRY.thumbOppositionDegrees * Math.PI / 180;
  thumb.root.rotation.x = -0.2;
  thumb.proximal.material = material;
  thumb.distal.material = material;
  root.add(thumb.root);
  digits.thumb = thumb;

  root.userData.sculptRuntime = {
    id: root.name,
    pivot: "wrist",
    sockets: {
      wrist: [0, dimensions.palmLength / 2 - dimensions.wristOverlap, 0],
      palmCenter: [0, 0, 0],
      ballContact: [0, -dimensions.palmLength * 0.16, dimensions.palmDepth * 0.52],
    },
    collider: {
      type: "capsule",
      radius: dimensions.handBreadth / 2,
      height: dimensions.palmLength,
    },
    attachment: {
      parentSocket: "wrist",
      contactType: "overlap",
      overlap: dimensions.wristOverlap,
      gapTolerance: 0.002,
    },
  };
  root.userData.handMetrics = dimensions;

  return {
    root,
    palm,
    digits: Object.freeze(digits),
    dimensions,
  };
}
