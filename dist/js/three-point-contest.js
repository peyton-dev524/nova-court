export const THREE_POINT_BALLS_PER_RACK = 5;
export const THREE_POINT_NORMAL_BALL_POINTS = 1;
export const THREE_POINT_MONEY_BALL_POINTS = 2;
export const THREE_POINT_NORMAL_BALL_STYLE = "classic";
export const THREE_POINT_MONEY_BALL_STYLE = "redWhiteBlue";

const BASKET = Object.freeze({ x: 0, z: -5.7 });

// Shooter spots sit just outside the authored 6.35 m arc. Rack props are
// offset beside the shooter so neither the player nor the automatic ball handoff
// intersects the frame.
export const THREE_POINT_RACKS = Object.freeze([
  Object.freeze({
    id: "left_corner",
    label: "Left Corner",
    x: -6.48,
    z: -4.84,
    propX: -6.95,
    propZ: -4.18,
  }),
  Object.freeze({
    id: "left_wing",
    label: "Left Wing",
    x: -5.36,
    z: -1.94,
    propX: -5.88,
    propZ: -1.42,
  }),
  Object.freeze({
    id: "top",
    label: "Top of Arc",
    x: 0,
    z: 0.76,
    propX: 0.7,
    propZ: 0.92,
  }),
  Object.freeze({
    id: "right_wing",
    label: "Right Wing",
    x: 5.36,
    z: -1.94,
    propX: 5.88,
    propZ: -1.42,
  }),
  Object.freeze({
    id: "right_corner",
    label: "Right Corner",
    x: 6.48,
    z: -4.84,
    propX: 6.95,
    propZ: -4.18,
  }),
]);

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
  scaleX = 1,
  scaleY = 1,
  scaleZ = 1,
}) {
  const helper = new T.Object3D();
  helper.position.set(x, y, z);
  helper.rotation.y = yaw;
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

  const rackCount = racks.length;
  const shelfGeometry = new T.BoxGeometry(1.55, 0.055, 0.34);
  const legGeometry = new T.BoxGeometry(0.07, 0.78, 0.07);
  const braceGeometry = new T.BoxGeometry(1.42, 0.06, 0.06);
  const ballGeometry = new T.SphereGeometry(0.12, 16, 12);
  const bandGeometry = new T.TorusGeometry(0.121, 0.014, 6, 20);

  const shelf = new T.InstancedMesh(shelfGeometry, rackMaterial, rackCount);
  const leftLeg = new T.InstancedMesh(legGeometry, rackMaterial, rackCount);
  const rightLeg = new T.InstancedMesh(legGeometry, rackMaterial, rackCount);
  const brace = new T.InstancedMesh(braceGeometry, rackMaterial, rackCount);
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
    const yaw = Math.atan2(BASKET.x - x, BASKET.z - z);
    placeInstance(T, shelf, rackIndex, { x, y: 0.82, z, yaw });
    const tangentX = Math.cos(yaw);
    const tangentZ = -Math.sin(yaw);
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    for (const [mesh, localX] of [[leftLeg, -0.62], [rightLeg, 0.62]]) {
      placeInstance(T, mesh, rackIndex, {
        x: x + tangentX * localX,
        y: 0.41,
        z: z + tangentZ * localX,
        yaw,
      });
    }
    placeInstance(T, brace, rackIndex, { x, y: 0.27, z, yaw });

    for (let ballIndex = 0; ballIndex < ballsPerRack; ballIndex += 1) {
      const localX = (ballIndex - (ballsPerRack - 1) / 2) * 0.285;
      const ballX = x + tangentX * localX - forwardX * 0.01;
      const ballZ = z + tangentZ * localX - forwardZ * 0.01;
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
      };
    },
  });
}
