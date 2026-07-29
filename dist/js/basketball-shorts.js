const DEFAULTS = Object.freeze({
  length: 0.45,
  flare: 0.045,
  sideVent: 0.055,
  sway: 0.052,
  stiffness: 48,
  damping: 10.5,
});

const LIMITS = Object.freeze({
  length: [0.34, 0.52],
  flare: [0.01, 0.085],
  sideVent: [0, 0.1],
  sway: [0, 0.09],
  stiffness: [20, 80],
  damping: [5, 18],
});

const SEGMENTS = 20;
const ROWS = 7;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

export function normalizeBasketballShortsParameters(value = {}) {
  const output = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const [min, max] = LIMITS[key];
    const candidate = Number.isFinite(Number(value[key])) ? Number(value[key]) : fallback;
    output[key] = clamp(candidate, min, max);
  }
  return Object.freeze(output);
}

export function estimateBasketballShortsCost() {
  const garmentTriangles = 2 * SEGMENTS * ROWS * 2;
  const waistbandTriangles = 12 * 4;
  return Object.freeze({
    drawCalls: 2,
    garmentTriangles,
    waistbandTriangles,
    totalTriangles: garmentTriangles + waistbandTriangles,
    dynamicVertices: 2 * SEGMENTS * (ROWS + 1),
    collisionTestsPerFrame: 2 * SEGMENTS * (ROWS + 1),
    textures: 0,
  });
}

export function stepShortsSpring(state, target, dt, stiffness, damping) {
  const safeDt = clamp(dt, 0, 1 / 20);
  const acceleration = (target - state.position) * stiffness - state.velocity * damping;
  const velocity = state.velocity + acceleration * safeDt;
  return {
    position: state.position + velocity * safeDt,
    velocity,
  };
}

export function constrainShortsVertexToCapsule(
  position,
  offset,
  capsule,
  radius,
  influence = 1,
) {
  const abX = capsule.endX - capsule.startX;
  const abY = capsule.endY - capsule.startY;
  const abZ = capsule.endZ - capsule.startZ;
  const apX = position[offset] - capsule.startX;
  const apY = position[offset + 1] - capsule.startY;
  const apZ = position[offset + 2] - capsule.startZ;
  const lengthSquared = abX * abX + abY * abY + abZ * abZ;
  const along = lengthSquared > 1e-8
    ? clamp((apX * abX + apY * abY + apZ * abZ) / lengthSquared, 0, 1)
    : 0;
  const nearestX = capsule.startX + abX * along;
  const nearestY = capsule.startY + abY * along;
  const nearestZ = capsule.startZ + abZ * along;
  let deltaX = position[offset] - nearestX;
  let deltaY = position[offset + 1] - nearestY;
  let deltaZ = position[offset + 2] - nearestZ;
  let distance = Math.hypot(deltaX, deltaY, deltaZ);
  if (distance >= radius) return 0;
  if (distance < 1e-6) {
    deltaX = capsule.startX < 0 ? -1 : 1;
    deltaY = 0;
    deltaZ = 0;
    distance = 1;
  }
  const correction = (radius - distance) * clamp(influence, 0, 1);
  position[offset] += deltaX / distance * correction;
  position[offset + 1] += deltaY / distance * correction;
  position[offset + 2] += deltaZ / distance * correction;
  return correction;
}

function colorForVertex(T, theta, side, rowProgress, mainColor, panelColor) {
  const outerDirection = side < 0 ? Math.PI : 0;
  const angularDelta = Math.atan2(
    Math.sin(theta - outerDirection),
    Math.cos(theta - outerDirection),
  );
  const panel = Math.abs(angularDelta) < 0.38;
  const hemShade = rowProgress > 0.82 ? 0.82 : 1;
  const color = new T.Color(panel ? panelColor : mainColor);
  color.multiplyScalar(hemShade);
  return color;
}

function writeGarmentShape(position, basePosition, metadata, params) {
  const topY = 0.17;
  for (let i = 0; i < metadata.length; i += 1) {
    const { side, row, theta } = metadata[i];
    const offset = i * 3;
    const rowProgress = row / ROWS;
    const ease = rowProgress * rowProgress;
    const outerDirection = side < 0 ? Math.PI : 0;
    const innerDirection = side < 0 ? 0 : Math.PI;
    const angularDelta = Math.atan2(
      Math.sin(theta - outerDirection),
      Math.cos(theta - outerDirection),
    );
    const innerDelta = Math.atan2(
      Math.sin(theta - innerDirection),
      Math.cos(theta - innerDirection),
    );
    const ventInfluence = Math.max(0, 1 - Math.abs(angularDelta) / 0.42);
    const innerRise = Math.max(0, 1 - Math.abs(innerDelta) / 0.78) ** 2 * 0.038;
    const fold = Math.cos(theta * 4 + side * 0.7) * 0.007 * ease;
    const radiusX = 0.153 + params.flare * ease + fold;
    const radiusZ = 0.142 + params.flare * 0.62 * ease - fold * 0.45;
    basePosition[offset] = side * 0.14 + Math.cos(theta) * radiusX;
    basePosition[offset + 1] = topY - params.length * rowProgress
      + (params.sideVent * ventInfluence + innerRise) * ease;
    basePosition[offset + 2] = Math.sin(theta) * radiusZ;
    position[offset] = basePosition[offset];
    position[offset + 1] = basePosition[offset + 1];
    position[offset + 2] = basePosition[offset + 2];
  }

}

function createGarmentGeometry(T, params, mainColor, panelColor) {
  const positions = [];
  const colors = [];
  const metadata = [];
  const indices = [];

  for (const side of [-1, 1]) {
    const sideOffset = metadata.length;
    for (let row = 0; row <= ROWS; row += 1) {
      const rowProgress = row / ROWS;
      for (let segment = 0; segment < SEGMENTS; segment += 1) {
        const theta = segment / SEGMENTS * Math.PI * 2;
        positions.push(0, 0, 0);
        metadata.push({ side, row, theta });
        const color = colorForVertex(T, theta, side, rowProgress, mainColor, panelColor);
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let row = 0; row < ROWS; row += 1) {
      for (let segment = 0; segment < SEGMENTS; segment += 1) {
        const next = (segment + 1) % SEGMENTS;
        const a = sideOffset + row * SEGMENTS + segment;
        const b = sideOffset + row * SEGMENTS + next;
        const c = sideOffset + (row + 1) * SEGMENTS + next;
        const d = sideOffset + (row + 1) * SEGMENTS + segment;
        indices.push(a, d, b, b, d, c);
      }
    }
  }

  const geometry = new T.BufferGeometry();
  const position = new Float32Array(positions);
  const basePosition = new Float32Array(positions.length);
  geometry.setAttribute("position", new T.BufferAttribute(position, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  writeGarmentShape(position, basePosition, metadata, params);
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, position, basePosition, metadata };
}

export function createBasketballShortsRig(T, {
  mainColor = 0x123f57,
  panelColor = 0x32e6c4,
  parameters = {},
} = {}) {
  let params = normalizeBasketballShortsParameters(parameters);
  const root = new T.Group();
  root.name = "basketball-shorts-rig";

  const material = new T.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.76,
    metalness: 0,
    sheen: 0.42,
    sheenRoughness: 0.82,
    sheenColor: new T.Color(mainColor).offsetHSL(0, -0.08, 0.16),
    side: T.DoubleSide,
  });
  const data = createGarmentGeometry(T, params, mainColor, panelColor);
  const garment = new T.Mesh(data.geometry, material);
  garment.name = "loose-basketball-shorts";
  garment.castShadow = true;
  garment.receiveShadow = true;
  root.add(garment);

  const waistbandMaterial = new T.MeshPhysicalMaterial({
    color: mainColor,
    roughness: 0.7,
    metalness: 0,
    sheen: 0.35,
    sheenRoughness: 0.8,
  });
  const waistband = new T.Mesh(
    new T.CylinderGeometry(0.266, 0.282, 0.13, 12, 1, false),
    waistbandMaterial,
  );
  waistband.name = "elastic-waistband";
  waistband.position.y = 0.205;
  waistband.scale.z = 0.74;
  waistband.castShadow = true;
  waistband.receiveShadow = true;
  root.add(waistband);

  const springs = {
    leftX: { position: 0, velocity: 0 },
    leftZ: { position: 0, velocity: 0 },
    rightX: { position: 0, velocity: 0 },
    rightZ: { position: 0, velocity: 0 },
  };
  const thighCapsules = [
    {
      startX: -0.165, startY: -0.05, startZ: 0,
      endX: -0.165, endY: -0.59, endZ: 0,
    },
    {
      startX: 0.165, startY: -0.05, startZ: 0,
      endX: 0.165, endY: -0.59, endZ: 0,
    },
  ];
  let clock = 0;

  function rebuildShape() {
    writeGarmentShape(data.position, data.basePosition, data.metadata, params);
    data.geometry.attributes.position.needsUpdate = true;
    data.geometry.computeBoundingSphere();
  }

  function update(dt, motion = {}) {
    const safeDt = clamp(dt, 0, 1 / 20);
    clock += safeDt;
    const speed = clamp(motion.speedRatio || 0, 0, 1.5);
    const lateral = clamp((motion.lateralSpeed || 0) / 5, -1, 1);
    const forward = clamp((motion.forwardSpeed || 0) / 5, -1, 1);
    const defense = clamp(motion.defenseBlend || 0, 0, 1);
    const airborne = clamp(motion.airborneBlend || 0, 0, 1);
    const hip = [
      clamp(motion.leftHipPitch || 0, -1.4, 1.4),
      clamp(motion.rightHipPitch || 0, -1.4, 1.4),
    ];
    const hipYaw = [
      clamp(motion.leftHipYaw || 0, -1.2, 1.2),
      clamp(motion.rightHipYaw || 0, -1.2, 1.2),
    ];
    const hipRoll = [
      clamp(motion.leftHipRoll || 0, -1.2, 1.2),
      clamp(motion.rightHipRoll || 0, -1.2, 1.2),
    ];

    for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
      const prefix = sideIndex === 0 ? "left" : "right";
      const sideSign = sideIndex === 0 ? -1 : 1;
      const strideDrag = Math.sin(hip[sideIndex]) * params.sway * 0.72;
      const targetX = (-lateral * params.sway * 0.65)
        + sideSign * defense * 0.008
        + Math.sin(clock * 8.5 + sideIndex * Math.PI) * speed * params.sway * 0.06;
      const targetZ = (-forward * params.sway * 0.55) + strideDrag
        + airborne * Math.sin(clock * 5 + sideIndex) * params.sway * 0.12;
      springs[`${prefix}X`] = stepShortsSpring(
        springs[`${prefix}X`],
        targetX,
        safeDt,
        params.stiffness,
        params.damping,
      );
      springs[`${prefix}Z`] = stepShortsSpring(
        springs[`${prefix}Z`],
        targetZ,
        safeDt,
        params.stiffness,
        params.damping,
      );

      const pitchSin = Math.sin(hip[sideIndex]);
      const pitchCos = Math.cos(hip[sideIndex]);
      const yawSin = Math.sin(hipYaw[sideIndex]);
      const yawCos = Math.cos(hipYaw[sideIndex]);
      const rollSin = Math.sin(hipRoll[sideIndex]);
      const rollCos = Math.cos(hipRoll[sideIndex]);
      const rotatedX = -yawSin * pitchSin;
      const rotatedY = -pitchCos;
      const rotatedZ = -yawCos * pitchSin;
      const directionX = rollCos * rotatedX - rollSin * rotatedY;
      const directionY = rollSin * rotatedX + rollCos * rotatedY;
      const capsule = thighCapsules[sideIndex];
      capsule.endX = capsule.startX + directionX * 0.54;
      capsule.endY = capsule.startY + directionY * 0.54;
      capsule.endZ = capsule.startZ + rotatedZ * 0.54;
    }

    for (let i = 0; i < data.metadata.length; i += 1) {
      const { side, row, theta } = data.metadata[i];
      const rowProgress = row / ROWS;
      const influence = rowProgress * rowProgress;
      const prefix = side < 0 ? "left" : "right";
      const offset = i * 3;
      const microFold = Math.sin(clock * (7 + speed * 3) + theta * 3 + side)
        * params.sway * 0.055 * influence * speed;
      data.position[offset] = data.basePosition[offset]
        + springs[`${prefix}X`].position * influence;
      data.position[offset + 1] = data.basePosition[offset + 1]
        + Math.abs(microFold) * 0.28;
      data.position[offset + 2] = data.basePosition[offset + 2]
        + springs[`${prefix}Z`].position * influence
        + microFold;
      const capsule = side < 0 ? thighCapsules[0] : thighCapsules[1];
      constrainShortsVertexToCapsule(
        data.position,
        offset,
        capsule,
        0.16 + rowProgress * 0.018,
        Math.min(1, rowProgress * 2.5),
      );
    }
    data.geometry.attributes.position.needsUpdate = true;
  }

  return Object.freeze({
    root,
    garment,
    waistband,
    update,
    setParameters(next = {}) {
      params = normalizeBasketballShortsParameters({ ...params, ...next });
      rebuildShape();
      return params;
    },
    getParameters() {
      return params;
    },
    getMetrics() {
      return estimateBasketballShortsCost();
    },
  });
}

export const BASKETBALL_SHORTS_DEFAULTS = DEFAULTS;
