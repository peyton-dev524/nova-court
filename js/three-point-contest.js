import { createRegulationCourtSpec } from "./court-dimensions.js";

export const THREE_POINT_BALLS_PER_RACK = 5;
export const THREE_POINT_NORMAL_BALL_POINTS = 1;
export const THREE_POINT_MONEY_BALL_POINTS = 2;
export const THREE_POINT_NORMAL_BALL_STYLE = "classic";
export const THREE_POINT_MONEY_BALL_STYLE = "redWhiteBlue";
// Quick enough to preserve contest rhythm while retaining readable
// reach/contact/gather poses for the production rig.
export const ARC_RUN_GRAB_DURATION = 0.36;

const HALF_COURT_BASKET = createRegulationCourtSpec("half").baskets.home;
const BASKET = Object.freeze({ x: HALF_COURT_BASKET.x, z: HALF_COURT_BASKET.z });

export const NBA_CORNER_THREE_METERS = 22 * 0.3048;
export const NBA_ABOVE_BREAK_THREE_METERS = 23.75 * 0.3048;
export const THREE_POINT_WING_ANGLE_RADIANS = Math.PI / 4;
export const THREE_POINT_RACK_REACH_OFFSET = 1.05;
export const THREE_POINT_RACK_BALL_SPACING = 0.285;
export const THREE_POINT_RACK_SPACE = Object.freeze({
  // Production half-court footprint: COURT.width 15 m × COURT.length 14 m.
  courtHalfWidth: 7.5,
  courtHalfLength: 7,
  // The 1.55 m shelf is the longest footprint component. The width includes
  // rails, wheels, and a small collision allowance.
  halfLength: 1.55 / 2,
  halfWidth: 0.23,
  boundaryMargin: 0.06,
  playerSideOffset: 0.82,
  playerRadius: 0.32,
  minPlayerBodyClearance: 0.2,
  maxPickupReach: 1.1,
});

function normalized2(x, z, fallback = { x: 0, z: -1 }) {
  const length = Math.hypot(x, z);
  return length > 1e-9
    ? { x: x / length, z: z / length }
    : { ...fallback };
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const clampRange = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep01 = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

/**
 * Deterministic reach/contact/gather choreography shared by the production
 * player rig, ball path, QA hooks, and tests.
 */
export function sampleArcRunGrab(progress, handSign = 1) {
  const t = clamp01(progress);
  const reach = smoothstep01(t / 0.38);
  const contact = smoothstep01((t - 0.32) / 0.2);
  const gather = smoothstep01((t - 0.52) / 0.48);
  const side = handSign < 0 ? -1 : 1;
  return Object.freeze({
    progress: t,
    phase: t < 0.32 ? "reach" : t < 0.62 ? "contact" : t < 1 ? "gather" : "complete",
    reach,
    contact,
    gather,
    ballBlend: smoothstep01((t - 0.4) / 0.6),
    handSign: side,
    activeShoulderPitch: -0.2 - reach * 0.84 + gather * 0.42,
    activeShoulderRoll: side * (0.1 + reach * 0.46 - gather * 0.34),
    activeElbow: -0.24 - reach * 0.48 + gather * 0.24,
    activeWrist: -0.18 * contact + 0.34 * gather,
    guideShoulderPitch: -0.1 - gather * 0.5,
    guideShoulderRoll: -side * (0.08 + gather * 0.24),
    guideElbow: -0.18 - gather * 0.32,
  });
}

function authorRack({
  id,
  label,
  x,
  z,
  tangentSign,
  layout = "radial",
  reachOffset = THREE_POINT_RACK_SPACE.playerSideOffset,
}) {
  const shooterToHoop = normalized2(BASKET.x - x, BASKET.z - z);
  const side = {
    x: -shooterToHoop.z * tangentSign,
    z: shooterToHoop.x * tangentSign,
  };
  const rackAxis = { x: -shooterToHoop.x, z: -shooterToHoop.z };
  const desiredPropX = x + side.x * reachOffset;
  const desiredPropZ = z + side.z * reachOffset;
  const footprintHalfX =
    Math.abs(rackAxis.x) * THREE_POINT_RACK_SPACE.halfLength
    + Math.abs(side.x) * THREE_POINT_RACK_SPACE.halfWidth;
  const footprintHalfZ =
    Math.abs(rackAxis.z) * THREE_POINT_RACK_SPACE.halfLength
    + Math.abs(side.z) * THREE_POINT_RACK_SPACE.halfWidth;
  const propX = clampRange(
    desiredPropX,
    -THREE_POINT_RACK_SPACE.courtHalfWidth
      + THREE_POINT_RACK_SPACE.boundaryMargin + footprintHalfX,
    THREE_POINT_RACK_SPACE.courtHalfWidth
      - THREE_POINT_RACK_SPACE.boundaryMargin - footprintHalfX,
  );
  const propZ = clampRange(
    desiredPropZ,
    -THREE_POINT_RACK_SPACE.courtHalfLength
      + THREE_POINT_RACK_SPACE.boundaryMargin + footprintHalfZ,
    THREE_POINT_RACK_SPACE.courtHalfLength
      - THREE_POINT_RACK_SPACE.boundaryMargin - footprintHalfZ,
  );
  const rackForward = normalized2(BASKET.x - propX, BASKET.z - propZ);
  const rackTangent = { x: -rackForward.z, z: rackForward.x };
  return Object.freeze({
    id,
    label,
    layout,
    x,
    z,
    propX,
    propZ,
    sideX: side.x,
    sideZ: side.z,
    boundaryAdjustmentX: propX - desiredPropX,
    boundaryAdjustmentZ: propZ - desiredPropZ,
    forwardX: rackForward.x,
    forwardZ: rackForward.z,
    tangentX: rackTangent.x,
    tangentZ: rackTangent.z,
    yaw: Math.atan2(rackForward.x, rackForward.z),
  });
}

// NBA's piecewise line is 22 ft in the corners and 23 ft 9 in above the
// break. The wing stations use sin/cos at 45 degrees around the rim. Corner
// stations sit 0.48 m up-court from the rim center to keep the avatar inside
// this game's compact half-court while remaining only 1.7 cm beyond 22 ft.
const cornerZ = BASKET.z + 0.48;
const wingX = Math.sin(THREE_POINT_WING_ANGLE_RADIANS) * NBA_ABOVE_BREAK_THREE_METERS;
const wingZ = BASKET.z
  + Math.cos(THREE_POINT_WING_ANGLE_RADIANS) * NBA_ABOVE_BREAK_THREE_METERS;
const topZ = BASKET.z + NBA_ABOVE_BREAK_THREE_METERS;

export const THREE_POINT_RACKS = Object.freeze([
  authorRack({
    id: "left_corner",
    label: "Left Corner",
    x: -NBA_CORNER_THREE_METERS,
    z: cornerZ,
    tangentSign: -1,
  }),
  authorRack({
    id: "left_wing",
    label: "Left Wing",
    x: -wingX,
    z: wingZ,
    tangentSign: 1,
  }),
  authorRack({
    id: "top",
    label: "Top of Arc",
    x: 0,
    z: topZ,
    tangentSign: -1,
  }),
  authorRack({
    id: "right_wing",
    label: "Right Wing",
    x: wingX,
    z: wingZ,
    tangentSign: -1,
  }),
  authorRack({
    id: "right_corner",
    label: "Right Corner",
    x: NBA_CORNER_THREE_METERS,
    z: cornerZ,
    tangentSign: 1,
  }),
]);

export function getThreePointRackPresentation(rack, basket = BASKET) {
  const shooter = {
    x: Number(rack?.x) || 0,
    z: Number(rack?.z) || 0,
  };
  const prop = {
    x: Number(rack?.propX ?? rack?.x) || 0,
    z: Number(rack?.propZ ?? rack?.z) || 0,
  };
  const forward = normalized2(
    (Number(basket?.x) || 0) - prop.x,
    (Number(basket?.z) || 0) - prop.z,
  );
  const tangent = { x: -forward.z, z: forward.x };
  const shooterToHoop = normalized2(
    (Number(basket?.x) || 0) - shooter.x,
    (Number(basket?.z) || 0) - shooter.z,
  );
  const rackToShooter = normalized2(shooter.x - prop.x, shooter.z - prop.z);
  const radialLayout = rack?.layout === "radial";
  // The center rack follows the contest reference: its long axis runs
  // directly toward/away from the hoop, while the player stands beside it.
  // The positive axis points away from the hoop so increasing ball indices
  // run visually top-to-bottom in the behind-player camera.
  const rackAxis = radialLayout
    ? { x: -shooterToHoop.x, z: -shooterToHoop.z }
    : tangent;
  const widthAxis = radialLayout
    ? normalized2(Number(rack?.sideX), Number(rack?.sideZ), tangent)
    : forward;
  const visualYaw = radialLayout
    ? Math.atan2(-rackAxis.z, rackAxis.x)
    : Math.atan2(forward.x, forward.z);
  return Object.freeze({
    shooter,
    prop,
    forward,
    tangent,
    layout: radialLayout ? "radial" : "tangent",
    rackAxis,
    widthAxis,
    yaw: Math.atan2(forward.x, forward.z),
    visualYaw,
    distanceToHoop: Math.hypot(shooter.x - (basket.x || 0), shooter.z - (basket.z || 0)),
    playerRackDistance: Math.hypot(prop.x - shooter.x, prop.z - shooter.z),
    forwardToHoopDot: forward.x * normalized2(
      (basket.x || 0) - prop.x,
      (basket.z || 0) - prop.z,
    ).x + forward.z * normalized2(
      (basket.x || 0) - prop.x,
      (basket.z || 0) - prop.z,
    ).z,
    tangentForwardDot: tangent.x * forward.x + tangent.z * forward.z,
    rackAxisShooterToHoopDot:
      rackAxis.x * shooterToHoop.x + rackAxis.z * shooterToHoop.z,
    shooterFacingHoopDot: shooterToHoop.x * shooterToHoop.x
      + shooterToHoop.z * shooterToHoop.z,
    rackSideDot: rackToShooter.x * tangent.x + rackToShooter.z * tangent.z,
  });
}

export function getThreePointRackSpaceMetrics(rack, basket = BASKET) {
  const presentation = getThreePointRackPresentation(rack, basket);
  const { shooter, prop, rackAxis, widthAxis } = presentation;
  const footprintHalfX =
    Math.abs(rackAxis.x) * THREE_POINT_RACK_SPACE.halfLength
    + Math.abs(widthAxis.x) * THREE_POINT_RACK_SPACE.halfWidth;
  const footprintHalfZ =
    Math.abs(rackAxis.z) * THREE_POINT_RACK_SPACE.halfLength
    + Math.abs(widthAxis.z) * THREE_POINT_RACK_SPACE.halfWidth;
  const boundaryClearance = Math.min(
    prop.x - footprintHalfX + THREE_POINT_RACK_SPACE.courtHalfWidth,
    THREE_POINT_RACK_SPACE.courtHalfWidth - prop.x - footprintHalfX,
    prop.z - footprintHalfZ + THREE_POINT_RACK_SPACE.courtHalfLength,
    THREE_POINT_RACK_SPACE.courtHalfLength - prop.z - footprintHalfZ,
  );
  const playerDelta = { x: shooter.x - prop.x, z: shooter.z - prop.z };
  const playerLength = Math.abs(playerDelta.x * rackAxis.x + playerDelta.z * rackAxis.z);
  const playerWidth = Math.abs(playerDelta.x * widthAxis.x + playerDelta.z * widthAxis.z);
  const frameDistance = Math.hypot(
    Math.max(0, playerLength - THREE_POINT_RACK_SPACE.halfLength),
    Math.max(0, playerWidth - THREE_POINT_RACK_SPACE.halfWidth),
  );
  const pickupDistances = Array.from({ length: THREE_POINT_BALLS_PER_RACK }, (_, ballIndex) => {
    const local = (ballIndex - (THREE_POINT_BALLS_PER_RACK - 1) / 2)
      * THREE_POINT_RACK_BALL_SPACING;
    const ballX = prop.x + rackAxis.x * local - widthAxis.x * 0.01;
    const ballZ = prop.z + rackAxis.z * local - widthAxis.z * 0.01;
    return Math.hypot(ballX - shooter.x, ballZ - shooter.z);
  });
  return Object.freeze({
    id: rack?.id || "",
    footprintHalfX,
    footprintHalfZ,
    boundaryClearance,
    playerBodyClearance: frameDistance - THREE_POINT_RACK_SPACE.playerRadius,
    firstBallDistance: pickupDistances[0],
    moneyBallDistance: pickupDistances[pickupDistances.length - 1],
    maxPickupDistance: Math.max(...pickupDistances),
    boundaryAdjustment: Math.hypot(
      Number(rack?.boundaryAdjustmentX) || 0,
      Number(rack?.boundaryAdjustmentZ) || 0,
    ),
  });
}

export function createArcRunCameraSnapshot({
  shooter,
  basket = BASKET,
  rack = null,
  behindDistance = 3.15,
  shoulderOffset = 0.58,
  height = 2.15,
  // The rendered court apron is wider than the 15 × 14 m playable surface.
  // Let the camera use that apron so corner stations retain a real behind-
  // player view without changing gameplay or rack bounds.
  cameraBounds = { halfWidth: 9.05, halfLength: 8.2 },
} = {}) {
  const player = {
    x: Number(shooter?.x) || 0,
    y: Number(shooter?.y) || 0,
    z: Number(shooter?.z) || 0,
  };
  const hoop = {
    x: Number(basket?.x) || 0,
    y: Number(basket?.y) || 3.05,
    z: Number(basket?.z) || BASKET.z,
  };
  const forward = normalized2(hoop.x - player.x, hoop.z - player.z);
  const right = { x: forward.z, z: -forward.x };
  const rackVector = rack
    ? normalized2(
      Number(rack.propX ?? rack.x) - player.x,
      Number(rack.propZ ?? rack.z) - player.z,
      right,
    )
    : right;
  const rackSide = Math.sign(rackVector.x * right.x + rackVector.z * right.z) || 1;
  const shoulderSign = -rackSide;
  const requestedShoulderX = right.x * shoulderOffset * shoulderSign;
  const requestedShoulderZ = right.z * shoulderOffset * shoulderSign;
  const maxBehindX = Math.abs(forward.x) > 1e-6
    ? Math.max(0.2, (
      cameraBounds.halfWidth - Math.abs(player.x + requestedShoulderX)
    ) / Math.abs(forward.x))
    : behindDistance;
  const maxBehindZ = Math.abs(forward.z) > 1e-6
    ? Math.max(0.2, (
      cameraBounds.halfLength - Math.abs(player.z + requestedShoulderZ)
    ) / Math.abs(forward.z))
    : behindDistance;
  const boundedBehindDistance = Math.min(behindDistance, maxBehindX, maxBehindZ);
  const boundedShoulderOffset = shoulderOffset;
  const shoulderX = right.x * boundedShoulderOffset * shoulderSign;
  const shoulderZ = right.z * boundedShoulderOffset * shoulderSign;
  const position = {
    x: Math.max(
      -cameraBounds.halfWidth,
      Math.min(cameraBounds.halfWidth, player.x - forward.x * boundedBehindDistance + shoulderX),
    ),
    y: player.y + height,
    z: Math.max(
      -cameraBounds.halfLength,
      Math.min(cameraBounds.halfLength, player.z - forward.z * boundedBehindDistance + shoulderZ),
    ),
  };
  const aimDistance = Math.min(
    3.8,
    Math.hypot(hoop.x - player.x, hoop.z - player.z) * 0.54,
    0.4 + boundedBehindDistance * 1.6,
  );
  const target = {
    x: player.x + forward.x * aimDistance,
    // Aim slightly below the chest so all five waist-high rack balls remain
    // above the lower HUD, especially at the left corner.
    y: 1.25,
    z: player.z + forward.z * aimDistance,
  };
  const cameraToTarget = normalized2(target.x - position.x, target.z - position.z);
  const shooterToCamera = normalized2(position.x - player.x, position.z - player.z);
  const cameraToRack = rack
    ? normalized2(
      Number(rack.propX ?? rack.x) - position.x,
      Number(rack.propZ ?? rack.z) - position.z,
      cameraToTarget,
    )
    : cameraToTarget;
  return Object.freeze({
    position: Object.freeze(position),
    target: Object.freeze(target),
    forward: Object.freeze(forward),
    right: Object.freeze(right),
    // Corner cameras cannot travel the full 3.15 m behind the shooter without
    // leaving the rendered apron. Widen proportionally so the near money-ball
    // endpoint and the player remain visible together.
    fov: 47 + (behindDistance - boundedBehindDistance) * 8,
    behindDistance: boundedBehindDistance,
    requestedBehindDistance: behindDistance,
    shoulderOffset: boundedShoulderOffset * shoulderSign,
    behindShooterDot: shooterToCamera.x * -forward.x + shooterToCamera.z * -forward.z,
    cameraTowardHoopDot: cameraToTarget.x * forward.x + cameraToTarget.z * forward.z,
    rackFramingDot:
      cameraToTarget.x * cameraToRack.x + cameraToTarget.z * cameraToRack.z,
  });
}

function asPositiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function createContestBallSequence({
  rackCount = THREE_POINT_RACKS.length,
  ballsPerRack = THREE_POINT_BALLS_PER_RACK,
  moneyBallSlot = ballsPerRack - 1,
} = {}) {
  const safeRackCount = asPositiveInteger(rackCount, THREE_POINT_RACKS.length);
  const safeBallsPerRack = asPositiveInteger(ballsPerRack, THREE_POINT_BALLS_PER_RACK);
  const safeMoneySlot = Math.max(
    0,
    Math.min(safeBallsPerRack - 1, Math.floor(Number(moneyBallSlot) || 0)),
  );
  const sequence = [];
  for (let rackIndex = 0; rackIndex < safeRackCount; rackIndex += 1) {
    for (let ballIndex = 0; ballIndex < safeBallsPerRack; ballIndex += 1) {
      const isMoneyBall = ballIndex === safeMoneySlot;
      sequence.push(Object.freeze({
        sequenceIndex: sequence.length,
        rackIndex,
        ballIndex,
        isMoneyBall,
        value: isMoneyBall
          ? THREE_POINT_MONEY_BALL_POINTS
          : THREE_POINT_NORMAL_BALL_POINTS,
        ballStyle: isMoneyBall
          ? THREE_POINT_MONEY_BALL_STYLE
          : THREE_POINT_NORMAL_BALL_STYLE,
      }));
    }
  }
  return Object.freeze(sequence);
}

export function contestRackDistance(rack, basket = BASKET) {
  return Math.hypot(
    (Number(rack?.x) || 0) - basket.x,
    (Number(rack?.z) || 0) - basket.z,
  );
}

function placeInstance(T, mesh, index, {
  x,
  y,
  z,
  yaw = 0,
  pitch = 0,
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
}) {
  const helper = new T.Object3D();
  helper.position.set(x, y, z);
  helper.rotation.y = yaw;
  helper.rotation.x = pitch;
  helper.scale.set(scaleX, scaleY, scaleZ);
  helper.updateMatrix();
  mesh.setMatrixAt(index, helper.matrix);
}

/**
 * Adds five lightweight contest racks. Shared instanced geometry keeps the
 * recognizable 25-ball setup to eight draw calls.
 */
export function createThreePointRackVisuals(T, scene, {
  racks = THREE_POINT_RACKS,
  ballsPerRack = THREE_POINT_BALLS_PER_RACK,
} = {}) {
  if (!T?.Group || !T?.InstancedMesh || !scene?.add) {
    throw new TypeError("Three-point rack visuals require THREE and a scene.");
  }
  const root = new T.Group();
  root.name = "three-point-contest-racks";
  scene.add(root);

  const rackMaterial = new T.MeshStandardMaterial({
    color: 0x263441,
    roughness: 0.38,
    metalness: 0.72,
  });
  const orangeMaterial = new T.MeshStandardMaterial({
    color: 0xc94f1b,
    roughness: 0.86,
    metalness: 0,
  });
  const moneyBaseMaterial = new T.MeshStandardMaterial({
    color: 0xe5e1d6,
    roughness: 0.82,
    metalness: 0,
  });
  const moneyRedMaterial = new T.MeshStandardMaterial({
    color: 0xb80e25,
    roughness: 0.82,
    metalness: 0,
  });
  const moneyBlueMaterial = new T.MeshStandardMaterial({
    color: 0x153b8d,
    roughness: 0.82,
    metalness: 0,
  });
  const frontCueMaterial = new T.MeshStandardMaterial({
    color: 0x38e8ff,
    emissive: 0x073b4a,
    emissiveIntensity: 0.42,
    roughness: 0.4,
    metalness: 0.55,
  });

  const rackCount = racks.length;
  const shelfGeometry = new T.BoxGeometry(1.55, 0.055, 0.34);
  const legGeometry = new T.BoxGeometry(0.07, 0.78, 0.07);
  const braceGeometry = new T.BoxGeometry(1.42, 0.06, 0.06);
  const railGeometry = new T.BoxGeometry(1.48, 0.065, 0.065);
  const wheelGeometry = new T.BoxGeometry(0.13, 0.13, 0.09);
  const ballGeometry = new T.SphereGeometry(0.12, 16, 12);
  const bandGeometry = new T.TorusGeometry(0.121, 0.014, 6, 20);

  const shelf = new T.InstancedMesh(shelfGeometry, rackMaterial, rackCount);
  const leftLeg = new T.InstancedMesh(legGeometry, rackMaterial, rackCount);
  const rightLeg = new T.InstancedMesh(legGeometry, rackMaterial, rackCount);
  const brace = new T.InstancedMesh(braceGeometry, rackMaterial, rackCount);
  const backRail = new T.InstancedMesh(railGeometry, rackMaterial, rackCount);
  const frontCue = new T.InstancedMesh(railGeometry, frontCueMaterial, rackCount);
  const wheels = new T.InstancedMesh(wheelGeometry, rackMaterial, rackCount * 2);
  const normalCount = rackCount * Math.max(0, ballsPerRack - 1);
  const normalBalls = new T.InstancedMesh(ballGeometry, orangeMaterial, normalCount);
  const moneyBalls = new T.InstancedMesh(ballGeometry, moneyBaseMaterial, rackCount);
  const moneyRedBands = new T.InstancedMesh(bandGeometry, moneyRedMaterial, rackCount);
  const moneyBlueBands = new T.InstancedMesh(bandGeometry, moneyBlueMaterial, rackCount);
  root.add(
    shelf,
    leftLeg,
    rightLeg,
    brace,
    backRail,
    frontCue,
    wheels,
    normalBalls,
    moneyBalls,
    moneyRedBands,
    moneyBlueBands,
  );

  const ballPlacements = [];
  let normalIndex = 0;
  racks.forEach((rack, rackIndex) => {
    const x = Number(rack.propX ?? rack.x) || 0;
    const z = Number(rack.propZ ?? rack.z) || 0;
    const presentation = getThreePointRackPresentation(rack);
    const yaw = presentation.visualYaw;
    const { x: lengthX, z: lengthZ } = presentation.rackAxis;
    const { x: widthX, z: widthZ } = presentation.widthAxis;
    placeInstance(T, shelf, rackIndex, { x, y: 0.82, z, yaw, pitch: 0.075 });
    for (const [mesh, localX] of [[leftLeg, -0.62], [rightLeg, 0.62]]) {
      placeInstance(T, mesh, rackIndex, {
        x: x + lengthX * localX,
        y: 0.41,
        z: z + lengthZ * localX,
        yaw,
      });
    }
    placeInstance(T, brace, rackIndex, { x, y: 0.27, z, yaw });
    placeInstance(T, backRail, rackIndex, {
      x: x - widthX * 0.19,
      y: 1.2,
      z: z - widthZ * 0.19,
      yaw,
    });
    placeInstance(T, frontCue, rackIndex, {
      x: x + widthX * 0.19,
      y: 0.75,
      z: z + widthZ * 0.19,
      yaw,
    });
    for (const [wheelOffset, localX] of [[rackIndex * 2, -0.62], [rackIndex * 2 + 1, 0.62]]) {
      placeInstance(T, wheels, wheelOffset, {
        x: x + lengthX * localX - widthX * 0.16,
        y: 0.12,
        z: z + lengthZ * localX - widthZ * 0.16,
        yaw,
      });
    }

    for (let ballIndex = 0; ballIndex < ballsPerRack; ballIndex += 1) {
      const localX = (ballIndex - (ballsPerRack - 1) / 2)
        * THREE_POINT_RACK_BALL_SPACING;
      const ballX = x + lengthX * localX - widthX * 0.01;
      const ballZ = z + lengthZ * localX - widthZ * 0.01;
      const placement = { x: ballX, y: 1.01, z: ballZ, yaw };
      if (ballIndex === ballsPerRack - 1) {
        placeInstance(T, moneyBalls, rackIndex, placement);
        placeInstance(T, moneyRedBands, rackIndex, {
          ...placement,
          yaw: yaw + Math.PI / 2,
        });
        placeInstance(T, moneyBlueBands, rackIndex, {
          ...placement,
          yaw,
        });
        ballPlacements.push({
          rackIndex,
          ballIndex,
          instances: [
            [moneyBalls, rackIndex],
            [moneyRedBands, rackIndex],
            [moneyBlueBands, rackIndex],
          ],
          placement,
        });
      } else {
        placeInstance(T, normalBalls, normalIndex, placement);
        ballPlacements.push({
          rackIndex,
          ballIndex,
          instances: [[normalBalls, normalIndex]],
          placement,
        });
        normalIndex += 1;
      }
    }
  });

  for (const mesh of root.children) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
  }

  const setConsumed = (rackIndex, ballIndex, consumed) => {
    const ball = ballPlacements.find(
      (entry) => entry.rackIndex === rackIndex && entry.ballIndex === ballIndex,
    );
    if (!ball) return;
    for (const [mesh, instanceIndex] of ball.instances) {
      placeInstance(T, mesh, instanceIndex, consumed
        ? { ...ball.placement, scaleX: 0, scaleY: 0, scaleZ: 0 }
        : ball.placement);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };

  return Object.freeze({
    root,
    getBallPlacement(rackIndex, ballIndex) {
      const ball = ballPlacements.find(
        (entry) => entry.rackIndex === rackIndex && entry.ballIndex === ballIndex,
      );
      return ball ? { ...ball.placement } : null;
    },
    takeBall(rackIndex, ballIndex) {
      setConsumed(rackIndex, ballIndex, true);
    },
    setCurrent(rackIndex, ballIndex) {
      for (const ball of ballPlacements) {
        const consumed = ball.rackIndex < rackIndex
          || (ball.rackIndex === rackIndex && ball.ballIndex < ballIndex);
        setConsumed(ball.rackIndex, ball.ballIndex, consumed);
      }
    },
    reset() {
      for (const ball of ballPlacements) {
        setConsumed(ball.rackIndex, ball.ballIndex, false);
      }
    },
    getSnapshot() {
      return {
        rackCount,
        ballCount: rackCount * ballsPerRack,
        drawCalls: root.children.length,
        racks: racks.map((rack) => ({
          id: rack.id,
          ...getThreePointRackPresentation(rack),
        })),
      };
    },
  });
}
