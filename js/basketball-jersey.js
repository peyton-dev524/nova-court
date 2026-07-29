export const JERSEY_REFERENCE_DIMENSIONS = Object.freeze({
  bodyWidthM: 19 * 0.0254, // 19 in, laid flat
  bodyLengthM: 29.75 * 0.0254, // 29.75 in
  tallLengthOptionsM: Object.freeze([0.0508, 0.1016]), // +2 / +4 in
  frontNumberMinM: 4 * 0.0254,
  backNumberMinM: 6 * 0.0254,
  armholeTrimMaxM: 1 * 0.0254,
  sidePanelMaxM: 4 * 0.0254,
});

const DEFAULTS = Object.freeze({
  fit: 1.04,
  length: JERSEY_REFERENCE_DIMENSIONS.bodyLengthM,
  hemFlare: 0.035,
  sidePanelWidth: 0.082,
  fabricResponse: 0.58,
});

const LIMITS = Object.freeze({
  fit: [0.96, 1.14],
  length: [0.69, 0.86],
  hemFlare: [0.012, 0.065],
  sidePanelWidth: [0.045, JERSEY_REFERENCE_DIMENSIONS.sidePanelMaxM],
  fabricResponse: [0, 1],
});

const SEGMENTS = 24;
const ROWS = 9;
const MAX_DYNAMIC_OFFSET = 0.042;

function clamp(value, min, max) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : min));
}

function smoothstep(min, max, value) {
  const t = clamp((value - min) / Math.max(1e-6, max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

export function normalizeBasketballJerseyParameters(value = {}) {
  const result = {};
  for (const [key, fallback] of Object.entries(DEFAULTS)) {
    const [min, max] = LIMITS[key];
    const candidate = value[key] === undefined ? fallback : value[key];
    result[key] = clamp(candidate, min, max);
  }
  return Object.freeze(result);
}

export function estimateBasketballJerseyCost() {
  const shellTriangles = SEGMENTS * ROWS * 2;
  const bindingTriangles = 4 * 14 * 4 * 2;
  return Object.freeze({
    drawCalls: 5,
    shellTriangles,
    bindingTriangles,
    totalTriangles: shellTriangles + bindingTriangles,
    dynamicVertices: SEGMENTS * (ROWS + 1),
    collisionTestsPerFrame: SEGMENTS * (ROWS + 1),
    textures: 0,
    maxDynamicOffsetM: MAX_DYNAMIC_OFFSET,
  });
}

export function jerseyCrossSection(vertical, theta, parameters = DEFAULTS) {
  const params = normalizeBasketballJerseyParameters(parameters);
  const shoulderInfluence = Math.abs(Math.cos(theta)) ** 4;
  const topY = 0.82 + shoulderInfluence * 0.145;
  const bottomY = 0.965 - params.length;
  const chestEase = smoothstep(0.48, 1, vertical);
  const hemEase = 1 - smoothstep(0, 0.42, vertical);
  const waistEase = 1 - Math.abs(vertical - 0.34) / 0.34;
  const fold = Math.sin(theta * 4) * 0.0045 * (1 - vertical);
  const radiusX = (0.255 + chestEase * 0.05 - Math.max(0, waistEase) * 0.012
    + hemEase * params.hemFlare + fold) * params.fit;
  const radiusZ = (0.174 + chestEase * 0.038 - Math.max(0, waistEase) * 0.006
    + hemEase * params.hemFlare * 0.62 - fold * 0.42) * params.fit;
  return Object.freeze({
    y: bottomY + (topY - bottomY) * vertical,
    topY,
    bottomY,
    radiusX,
    radiusZ,
    shoulderInfluence,
  });
}

export function jerseyTorsoClearance(vertical, theta, parameters = DEFAULTS) {
  const section = jerseyCrossSection(vertical, theta, parameters);
  const garmentRadius = Math.hypot(
    Math.cos(theta) * section.radiusX,
    Math.sin(theta) * section.radiusZ,
  );
  const torsoRadiusX = 0.226 + smoothstep(0.48, 1, vertical) * 0.055;
  const torsoRadiusZ = 0.145 + smoothstep(0.48, 1, vertical) * 0.035;
  const torsoRadius = Math.hypot(
    Math.cos(theta) * torsoRadiusX,
    Math.sin(theta) * torsoRadiusZ,
  );
  return garmentRadius - torsoRadius;
}

export function sampleJerseyClearance(parameters = DEFAULTS) {
  let minimumM = Infinity;
  for (let row = 0; row <= ROWS; row += 1) {
    for (let segment = 0; segment < SEGMENTS; segment += 1) {
      const theta = segment / SEGMENTS * Math.PI * 2;
      minimumM = Math.min(minimumM, jerseyTorsoClearance(row / ROWS, theta, parameters));
    }
  }
  return Object.freeze({ minimumM, passes: minimumM >= 0.008 });
}

export function stepJerseySpring(state, target, dt, fabricResponse) {
  const response = clamp(fabricResponse, 0, 1);
  const stiffness = 30 + response * 34;
  const damping = 9.5 + (1 - response) * 4.5;
  const safeDt = clamp(dt, 0, 1 / 20);
  const acceleration = (target - state.position) * stiffness - state.velocity * damping;
  const velocity = state.velocity + acceleration * safeDt;
  return Object.freeze({
    position: clamp(state.position + velocity * safeDt, -MAX_DYNAMIC_OFFSET, MAX_DYNAMIC_OFFSET),
    velocity: clamp(velocity, -0.55, 0.55),
  });
}

function writeShellShape(position, basePosition, metadata, params) {
  for (let index = 0; index < metadata.length; index += 1) {
    const { theta, vertical } = metadata[index];
    const section = jerseyCrossSection(vertical, theta, params);
    const offset = index * 3;
    basePosition[offset] = Math.cos(theta) * section.radiusX;
    basePosition[offset + 1] = section.y;
    basePosition[offset + 2] = Math.sin(theta) * section.radiusZ;
    position[offset] = basePosition[offset];
    position[offset + 1] = basePosition[offset + 1];
    position[offset + 2] = basePosition[offset + 2];
  }
}

function createShellGeometry(T, params, mainColor, panelColor, trimColor) {
  const positions = [];
  const colors = [];
  const metadata = [];
  const indices = [];
  const main = new T.Color(mainColor);
  const panel = new T.Color(panelColor);
  const trim = new T.Color(trimColor);
  const sideHalfAngle = Math.min(
    0.42,
    params.sidePanelWidth / Math.max(0.17, 2 * 0.255),
  );
  for (let row = 0; row <= ROWS; row += 1) {
    const vertical = row / ROWS;
    for (let segment = 0; segment < SEGMENTS; segment += 1) {
      const theta = segment / SEGMENTS * Math.PI * 2;
      positions.push(0, 0, 0);
      metadata.push({ theta, vertical });
      const nearestSide = Math.min(
        Math.abs(Math.atan2(Math.sin(theta), Math.cos(theta))),
        Math.abs(Math.atan2(Math.sin(theta - Math.PI), Math.cos(theta - Math.PI))),
      );
      const source = vertical < 0.045 ? trim : nearestSide < sideHalfAngle ? panel : main;
      const shade = 0.93 + Math.cos(theta - Math.PI / 2) * 0.035;
      colors.push(source.r * shade, source.g * shade, source.b * shade);
    }
  }
  for (let row = 0; row < ROWS; row += 1) {
    for (let segment = 0; segment < SEGMENTS; segment += 1) {
      const next = (segment + 1) % SEGMENTS;
      const a = row * SEGMENTS + segment;
      const b = row * SEGMENTS + next;
      const c = (row + 1) * SEGMENTS + next;
      const d = (row + 1) * SEGMENTS + segment;
      indices.push(a, d, b, b, d, c);
    }
  }
  const geometry = new T.BufferGeometry();
  const position = new Float32Array(positions);
  const basePosition = new Float32Array(positions.length);
  geometry.setAttribute("position", new T.BufferAttribute(position, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  writeShellShape(position, basePosition, metadata, params);
  geometry.attributes.position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return { geometry, position, basePosition, metadata };
}

function createBinding(T, points, material, name) {
  const curve = new T.CatmullRomCurve3(points.map((point) => new T.Vector3(...point)));
  const mesh = new T.Mesh(new T.TubeGeometry(curve, 14, 0.0095, 4, false), material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createBasketballJerseyRig(T, {
  mainColor = 0x32e6c4,
  panelColor = 0x123f57,
  trimColor = panelColor,
  parameters = {},
} = {}) {
  let params = normalizeBasketballJerseyParameters(parameters);
  const root = new T.Group();
  root.name = "loose-performance-jersey-rig";
  const material = new T.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
    sheen: 0.5,
    sheenRoughness: 0.84,
    sheenColor: new T.Color(mainColor).offsetHSL(0, -0.08, 0.18),
    side: T.DoubleSide,
  });
  const bindingMaterial = new T.MeshPhysicalMaterial({
    color: trimColor,
    roughness: 0.68,
    metalness: 0,
    sheen: 0.28,
    sheenRoughness: 0.78,
  });
  const data = createShellGeometry(T, params, mainColor, panelColor, trimColor);
  const shell = new T.Mesh(data.geometry, material);
  shell.name = "dimensioned-loose-jersey-shell";
  shell.castShadow = true;
  shell.receiveShadow = true;
  root.add(shell);

  const bindings = [
    createBinding(T, [[-0.225, 0.925, 0.19], [0, 0.82, 0.215], [0.225, 0.925, 0.19]], bindingMaterial, "front-v-neck-binding"),
    createBinding(T, [[-0.225, 0.925, -0.19], [0, 0.895, -0.205], [0.225, 0.925, -0.19]], bindingMaterial, "back-neck-binding"),
    createBinding(T, [[-0.215, 0.84, 0.19], [-0.305, 0.955, 0], [-0.215, 0.84, -0.19]], bindingMaterial, "left-armhole-binding"),
    createBinding(T, [[0.215, 0.84, 0.19], [0.305, 0.955, 0], [0.215, 0.84, -0.19]], bindingMaterial, "right-armhole-binding"),
  ];
  root.add(...bindings);

  let swayState = { position: 0, velocity: 0 };
  let flutterState = { position: 0, velocity: 0 };
  let elapsed = 0;

  function rebuild(nextParameters) {
    params = normalizeBasketballJerseyParameters(nextParameters);
    writeShellShape(data.position, data.basePosition, data.metadata, params);
    data.geometry.attributes.position.needsUpdate = true;
    data.geometry.computeVertexNormals();
    data.geometry.computeBoundingSphere();
  }

  const runtime = Object.freeze({
    sourceDimensions: JERSEY_REFERENCE_DIMENSIONS,
    inferredSurfaces: Object.freeze(["interior seams", "cloth thickness", "hidden back-neck topology"]),
    attachment: Object.freeze({
      shoulderSocketY: 0.925,
      stableFromVertical: 0.62,
      torsoClearanceM: sampleJerseyClearance(params).minimumM,
    }),
    budget: estimateBasketballJerseyCost(),
  });
  root.userData.sculptRuntime = runtime;

  return Object.freeze({
    root,
    shell,
    bindings: Object.freeze(bindings),
    setParameters(next = {}) {
      rebuild({ ...params, ...next });
      return Object.freeze({ ...params });
    },
    getParameters() {
      return Object.freeze({ ...params });
    },
    getMetrics() {
      return Object.freeze({
        ...estimateBasketballJerseyCost(),
        clearance: sampleJerseyClearance(params),
      });
    },
    update(dt, motion = {}) {
      elapsed += clamp(dt, 0, 1 / 20);
      const response = params.fabricResponse;
      const targetSway = clamp(
        (Number(motion.lateralSpeed) || 0) * -0.0065
          + (Number(motion.torsoYaw) || 0) * 0.018,
        -MAX_DYNAMIC_OFFSET,
        MAX_DYNAMIC_OFFSET,
      ) * response;
      const targetFlutter = clamp(
        Math.hypot(Number(motion.forwardSpeed) || 0, Number(motion.lateralSpeed) || 0) * 0.004,
        0,
        MAX_DYNAMIC_OFFSET * 0.72,
      ) * response;
      swayState = stepJerseySpring(swayState, targetSway, dt, response);
      flutterState = stepJerseySpring(flutterState, targetFlutter, dt, response);
      for (let index = 0; index < data.metadata.length; index += 1) {
        const { theta, vertical } = data.metadata[index];
        const dynamicWeight = 1 - smoothstep(0.42, 0.82, vertical);
        const sideWeight = Math.abs(Math.cos(theta)) ** 1.5;
        const offset = index * 3;
        const flutter = Math.sin(elapsed * 7.2 + theta * 3.1) * flutterState.position;
        data.position[offset] = data.basePosition[offset]
          + (swayState.position + flutter * 0.45) * dynamicWeight;
        data.position[offset + 1] = data.basePosition[offset + 1]
          + Math.abs(flutter) * 0.18 * dynamicWeight;
        data.position[offset + 2] = data.basePosition[offset + 2]
          + flutter * dynamicWeight * (0.4 + sideWeight * 0.6);
      }
      data.geometry.attributes.position.needsUpdate = true;
      data.geometry.computeVertexNormals();
    },
  });
}
