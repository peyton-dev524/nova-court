/**
 * NOVA PARK visual kit and replay direction helpers.
 *
 * Everything in this module is code-native. `createNightPark()` receives the
 * host's THREE namespace so importing the pure replay helpers in Node does not
 * require a DOM, WebGL, or a Three.js package.
 */

export const PARK_QUALITY = Object.freeze({
  low: Object.freeze({
    crowd: 24,
    skyline: 18,
    fenceSegments: 10,
    activeLights: 0,
    lampCount: 4,
    bleacherRows: 2,
    castShadows: false,
    crowdAnimationStride: 4,
  }),
  balanced: Object.freeze({
    crowd: 54,
    skyline: 28,
    fenceSegments: 16,
    activeLights: 2,
    lampCount: 4,
    bleacherRows: 3,
    castShadows: false,
    crowdAnimationStride: 2,
  }),
  high: Object.freeze({
    crowd: 88,
    skyline: 40,
    fenceSegments: 22,
    activeLights: 4,
    lampCount: 4,
    bleacherRows: 4,
    castShadows: true,
    crowdAnimationStride: 1,
  }),
});

export const REPLAY_SHOTS = Object.freeze({
  ESTABLISH: "establish",
  SIDELINE_TRACK: "sideline-track",
  RIM_ORBIT: "rim-orbit",
  HERO_FOLLOW: "hero-follow",
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const distance3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const replayEase = (value) => {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export const replayEaseOut = (value) => 1 - Math.pow(1 - clamp01(value), 4);

export function selectReplayShot(progress, seed = 0) {
  const t = clamp01(progress);
  if (t < 0.17) return REPLAY_SHOTS.ESTABLISH;
  if (t < 0.52) return REPLAY_SHOTS.SIDELINE_TRACK;
  if (t < 0.79) return REPLAY_SHOTS.RIM_ORBIT;
  // Seed changes which shoulder owns the final hero angle without affecting cuts.
  return REPLAY_SHOTS.HERO_FOLLOW + (Math.abs(Math.trunc(seed)) % 2 ? "-left" : "-right");
}

/**
 * Finds the two frames surrounding normalized replay time. This intentionally
 * returns interpolation metadata rather than Three.js objects, making it useful
 * to both the renderer and deterministic tests.
 */
export function getReplayFrameWindow(frameCount, progress) {
  const count = Math.max(0, Math.trunc(frameCount));
  if (count === 0) return { from: -1, to: -1, alpha: 0 };
  if (count === 1) return { from: 0, to: 0, alpha: 0 };
  const cursor = clamp01(progress) * (count - 1);
  const from = Math.floor(cursor);
  const to = Math.min(count - 1, from + 1);
  return { from, to, alpha: replayEase(cursor - from) };
}

/**
 * Produces a cinematic camera sample with intentional hard cuts and smooth
 * movement inside each shot. Inputs and outputs are plain arrays to avoid
 * per-frame allocations of Three.js classes in the engine integration.
 */
export function sampleReplayCamera({
  progress = 0,
  ball = [0, 3.05, -5.7],
  scorer = [0, 1, -2],
  hoop = [0, 3.05, -5.7],
  seed = 0,
  courtWidth = 15,
} = {}) {
  const t = clamp01(progress);
  const shot = selectReplayShot(t, seed);
  const side = Math.abs(Math.trunc(seed)) % 2 ? -1 : 1;
  let position;
  let target;
  let fov;
  let slowMotion = 0.72;

  if (shot === REPLAY_SHOTS.ESTABLISH) {
    const local = replayEase(t / 0.17);
    position = mix3([side * courtWidth * 0.54, 5.7, 7.8], [side * courtWidth * 0.42, 4.7, 5.2], local);
    target = mix3([0, 1.35, -1.1], ball, local * 0.34);
    fov = lerp(43, 39, local);
    slowMotion = 0.78;
  } else if (shot === REPLAY_SHOTS.SIDELINE_TRACK) {
    const local = replayEase((t - 0.17) / 0.35);
    const actionTarget = mix3(scorer, ball, 0.58);
    position = [
      lerp(scorer[0] + side * 5.4, ball[0] + side * 4.1, local),
      lerp(2.55, 3.45, local),
      lerp(scorer[2] + 2.9, ball[2] + 1.7, local),
    ];
    target = [actionTarget[0], actionTarget[1] + 0.72, actionTarget[2] - local * 0.35];
    fov = lerp(37, 33, local);
    slowMotion = lerp(0.7, 0.52, local);
  } else if (shot === REPLAY_SHOTS.RIM_ORBIT) {
    const local = replayEase((t - 0.52) / 0.27);
    const angle = side * lerp(0.28, 1.72, local) - Math.PI / 2;
    const radius = lerp(3.45, 2.6, replayEaseOut(local));
    position = [
      hoop[0] + Math.cos(angle) * radius,
      hoop[1] + lerp(0.82, 1.55, Math.sin(local * Math.PI)),
      hoop[2] + Math.sin(angle) * radius,
    ];
    target = mix3(ball, hoop, 0.62 + local * 0.28);
    fov = lerp(34, 29, local);
    slowMotion = 0.42;
  } else {
    const local = replayEase((t - 0.79) / 0.21);
    position = [
      scorer[0] - side * lerp(3.25, 4.15, local),
      scorer[1] + lerp(2.05, 2.75, local),
      scorer[2] + lerp(3.15, 4.45, local),
    ];
    target = [scorer[0], scorer[1] + lerp(1.1, 1.45, local), scorer[2] - 0.15];
    fov = lerp(31, 36, local);
    slowMotion = lerp(0.48, 0.84, local);
  }

  // Never return a camera at its target even if malformed coordinates are passed.
  if (distance3(position, target) < 0.05) position[2] += 0.05;
  return { shot, position, target, fov, slowMotion };
}

/**
 * Animation emphasis envelope for a made-shot replay. The engine can multiply
 * its existing procedural pose targets by these values; no physics are changed.
 */
export function sampleReplayPoseEmphasis(progress, impactProgress = 0.67) {
  const t = clamp01(progress);
  const impact = clamp01(impactProgress);
  const beforeImpact = clamp01(t / Math.max(0.001, impact));
  const afterImpact = clamp01((t - impact) / Math.max(0.001, 1 - impact));
  const lift = Math.sin(beforeImpact * Math.PI) * (t <= impact ? 1 : 0);
  const release = replayEaseOut(clamp01((t - impact * 0.66) / 0.22));
  const celebration = replayEase(afterImpact);
  const impactPulse = Math.exp(-Math.pow((t - impact) / 0.045, 2));
  return {
    jumpLift: lift * 0.12,
    torsoLean: lerp(-0.06, 0.1, release) - celebration * 0.04,
    shootingArmExtension: release,
    wristSnap: replayEaseOut(clamp01((t - impact * 0.72) / 0.17)),
    landingCompression: Math.exp(-Math.pow((t - Math.min(0.96, impact + 0.17)) / 0.065, 2)) * 0.14,
    celebration,
    impactPulse,
    cameraShake: impactPulse * 0.035,
  };
}

function normalizedQuality(quality) {
  return Object.hasOwn(PARK_QUALITY, quality) ? quality : "balanced";
}

function makeCanvasTexture(T, resources, title, subtitle) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#071923");
  gradient.addColorStop(0.55, "#0c3340");
  gradient.addColorStop(1, "#c84f35");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#65ebf4";
  context.lineWidth = 12;
  context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#f7f3e9";
  context.font = "900 96px Arial Black, Arial, sans-serif";
  context.fillText(title, canvas.width / 2, 108);
  context.fillStyle = "#ffb06a";
  context.font = "800 32px Arial, sans-serif";
  context.fillText(subtitle, canvas.width / 2, 188);
  const texture = new T.CanvasTexture(canvas);
  if (T.SRGBColorSpace) texture.colorSpace = T.SRGBColorSpace;
  resources.textures.add(texture);
  return texture;
}

/**
 * Builds a performant original outdoor night-park surround.
 *
 * @param {object} T THREE namespace
 * @param {object} options parent, quality, courtWidth, courtLength, seed
 * @returns {{group: object, update: Function, dispose: Function, stats: object}}
 */
export function createNightPark(T, options = {}) {
  if (!T?.Group || !T?.Mesh || !T?.InstancedMesh) {
    throw new TypeError("createNightPark requires a complete THREE namespace.");
  }
  const quality = normalizedQuality(options.quality);
  const config = PARK_QUALITY[quality];
  const courtWidth = Number.isFinite(options.courtWidth) ? options.courtWidth : 15;
  const courtLength = Number.isFinite(options.courtLength) ? options.courtLength : 14;
  let randomState = (Math.trunc(options.seed ?? 7319) >>> 0) || 7319;
  const random = () => {
    randomState = (randomState * 1664525 + 1013904223) >>> 0;
    return randomState / 4294967296;
  };

  const resources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };
  const geometry = (value) => (resources.geometries.add(value), value);
  const material = (value) => (resources.materials.add(value), value);
  const group = new T.Group();
  group.name = "nova-night-park";
  group.position.set(
    Number(options.offsetX) || 0,
    Number(options.offsetY) || 0,
    Number(options.offsetZ) || 0,
  );

  const darkMetal = material(new T.MeshStandardMaterial({ color: 0x26333b, roughness: 0.54, metalness: 0.68 }));
  const fenceMaterial = material(new T.MeshBasicMaterial({
    color: 0x26343c,
    transparent: true,
    opacity: 0.18,
    wireframe: true,
    depthWrite: false,
  }));
  const concrete = material(new T.MeshStandardMaterial({ color: 0x34383b, roughness: 0.94 }));
  const benchMaterial = material(new T.MeshStandardMaterial({ color: 0x244650, roughness: 0.7, metalness: 0.28 }));
  const glowMaterial = material(new T.MeshBasicMaterial({ color: 0xbdfaff, toneMapped: false }));
  const buildingMaterial = material(new T.MeshStandardMaterial({
    color: 0x101c28,
    emissive: 0x07121a,
    emissiveIntensity: 0.58,
    roughness: 0.88,
  }));
  const crowdMaterial = material(new T.MeshStandardMaterial({
    color: 0x546373,
    roughness: 0.92,
    vertexColors: true,
  }));

  // Court apron prevents the indoor arena void from showing beneath the fence.
  const apron = new T.Mesh(
    geometry(new T.PlaneGeometry(courtWidth + 8.5, courtLength + 9)),
    material(new T.MeshStandardMaterial({ color: 0x101d22, roughness: 0.94 })),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.052;
  apron.receiveShadow = true;
  group.add(apron);

  const postGeometry = geometry(new T.CylinderGeometry(0.045, 0.055, 3.1, 7));
  const fenceDepth = courtLength / 2 + 2.4;
  const fenceWidth = courtWidth / 2 + 2.35;
  const addFence = (width, height, x, z, rotationY = 0) => {
    const panel = new T.Mesh(
      geometry(new T.PlaneGeometry(width, height, config.fenceSegments, Math.max(4, Math.round(config.fenceSegments * 0.42)))),
      fenceMaterial,
    );
    panel.position.set(x, height / 2, z);
    panel.rotation.y = rotationY;
    group.add(panel);
    const posts = Math.ceil(width / 2.05) + 1;
    for (let index = 0; index < posts; index++) {
      const post = new T.Mesh(postGeometry, darkMetal);
      const along = -width / 2 + (index / Math.max(1, posts - 1)) * width;
      post.position.set(x + Math.cos(rotationY) * along, 1.55, z - Math.sin(rotationY) * along);
      group.add(post);
    }
  };
  addFence(courtWidth + 4.7, 3.05, 0, -fenceDepth);
  addFence(courtLength + 4.8, 3.05, -fenceWidth, 0, Math.PI / 2);
  addFence(courtLength + 4.8, 3.05, fenceWidth, 0, Math.PI / 2);

  // Skyline is a single instanced draw call with deterministic scale variation.
  const skylineGeometry = geometry(new T.BoxGeometry(1, 1, 1));
  const skyline = new T.InstancedMesh(skylineGeometry, buildingMaterial, config.skyline);
  const dummy = new T.Object3D();
  for (let index = 0; index < config.skyline; index++) {
    const side = index % 2 ? 1 : -1;
    const x = side * (8.5 + random() * 12);
    const z = -10 - random() * 9;
    const width = 1.3 + random() * 2.7;
    const height = 3.5 + random() * 10;
    const depth = 1.8 + random() * 3.2;
    dummy.position.set(x, height / 2 - 0.25, z);
    dummy.scale.set(width, height, depth);
    dummy.rotation.set(0, random() * 0.08 * side, 0);
    dummy.updateMatrix();
    skyline.setMatrixAt(index, dummy.matrix);
    if (skyline.setColorAt) {
      const color = new T.Color(index % 5 === 0 ? 0x172d3c : index % 3 === 0 ? 0x172534 : 0x111c28);
      skyline.setColorAt(index, color);
    }
  }
  skyline.instanceMatrix.needsUpdate = true;
  if (skyline.instanceColor) skyline.instanceColor.needsUpdate = true;
  group.add(skyline);

  // Shared lamp geometry; only higher quality tiers spend dynamic-light budget.
  const lampPoleGeometry = geometry(new T.CylinderGeometry(0.07, 0.11, 6.1, 8));
  const lampHeadGeometry = geometry(new T.BoxGeometry(0.75, 0.16, 0.48));
  const lampPositions = [
    [-fenceWidth - 0.65, 0, -5.1],
    [fenceWidth + 0.65, 0, -5.1],
    [-fenceWidth - 0.65, 0, 5.15],
    [fenceWidth + 0.65, 0, 5.15],
  ];
  const activeLights = [];
  lampPositions.slice(0, config.lampCount).forEach(([x, , z], index) => {
    const pole = new T.Mesh(lampPoleGeometry, darkMetal);
    pole.position.set(x, 3.05, z);
    pole.castShadow = config.castShadows;
    const head = new T.Mesh(lampHeadGeometry, glowMaterial);
    head.position.set(x, 6.02, z);
    head.rotation.y = x < 0 ? -0.18 : 0.18;
    group.add(pole, head);
    if (index < config.activeLights) {
      const light = new T.PointLight(0xcff7ff, quality === "high" ? 8.5 : 6.5, 17, 1.7);
      light.position.set(x * 0.91, 5.8, z * 0.88);
      light.castShadow = config.castShadows && index < 2;
      if (light.shadow?.mapSize) light.shadow.mapSize.set(512, 512);
      group.add(light);
      activeLights.push(light);
    }
  });

  // Sideline benches and compact bleachers use shared meshes/materials.
  const beamGeometry = geometry(new T.BoxGeometry(4.9, 0.16, 0.48));
  const riserGeometry = geometry(new T.BoxGeometry(5.2, 0.22, 0.72));
  for (const side of [-1, 1]) {
    for (let row = 0; row < config.bleacherRows; row++) {
      const riser = new T.Mesh(riserGeometry, concrete);
      riser.position.set(side * (fenceWidth + 1.1), 0.11 + row * 0.34, 2.6 + row * 0.52);
      riser.rotation.y = Math.PI / 2;
      const seat = new T.Mesh(beamGeometry, benchMaterial);
      seat.position.set(side * (fenceWidth + 0.98), 0.36 + row * 0.34, 2.6 + row * 0.52);
      seat.rotation.y = Math.PI / 2;
      group.add(riser, seat);
    }
    const benchSeat = new T.Mesh(beamGeometry, benchMaterial);
    benchSeat.scale.set(0.76, 1, 1);
    benchSeat.rotation.y = Math.PI / 2;
    benchSeat.position.set(side * (fenceWidth + 0.45), 0.48, -2.7);
    group.add(benchSeat);
  }

  // Two instanced crowd layers (body/head) keep 88 spectators to two draw calls.
  const crowdBodyGeometry = geometry(new T.CapsuleGeometry(0.11, 0.3, 2, 5));
  const crowdHeadGeometry = geometry(new T.SphereGeometry(0.105, 7, 5));
  const headMaterial = material(new T.MeshStandardMaterial({ color: 0xa87862, roughness: 0.94, vertexColors: true }));
  const crowdBodies = new T.InstancedMesh(crowdBodyGeometry, crowdMaterial, config.crowd);
  const crowdHeads = new T.InstancedMesh(crowdHeadGeometry, headMaterial, config.crowd);
  const crowdBase = [];
  const fanColors = [0x2b6a72, 0x954e3e, 0x40537c, 0x6e477c, 0x96703b, 0x32454f];
  const skinColors = [0x734832, 0x96664e, 0xb87d5b, 0xd0a081, 0x5b3729];
  for (let index = 0; index < config.crowd; index++) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 18) % config.bleacherRows;
    const column = Math.floor(index / 2) % 9;
    const x = side * (fenceWidth + 0.72 + row * 0.2);
    const y = 0.58 + row * 0.34;
    const z = -0.7 + column * 0.73 + (random() - 0.5) * 0.15;
    crowdBase.push({ x, y, z, phase: random() * Math.PI * 2, scale: 0.9 + random() * 0.16 });
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(crowdBase[index].scale);
    dummy.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    dummy.updateMatrix();
    crowdBodies.setMatrixAt(index, dummy.matrix);
    crowdBodies.setColorAt?.(index, new T.Color(fanColors[index % fanColors.length]));
    dummy.position.y = y + 0.43 * crowdBase[index].scale;
    dummy.scale.setScalar(crowdBase[index].scale);
    dummy.updateMatrix();
    crowdHeads.setMatrixAt(index, dummy.matrix);
    crowdHeads.setColorAt?.(index, new T.Color(skinColors[index % skinColors.length]));
  }
  crowdBodies.instanceMatrix.needsUpdate = true;
  crowdHeads.instanceMatrix.needsUpdate = true;
  if (crowdBodies.instanceColor) crowdBodies.instanceColor.needsUpdate = true;
  if (crowdHeads.instanceColor) crowdHeads.instanceColor.needsUpdate = true;
  group.add(crowdBodies, crowdHeads);

  // Original park signage; gracefully falls back to a solid neon panel sans DOM.
  const signTexture = makeCanvasTexture(T, resources, "NOVA PARK", "NIGHT RUNS · PLAY BOLD");
  const signMaterial = material(new T.MeshBasicMaterial({
    color: signTexture ? 0xffffff : 0x38d9e8,
    map: signTexture,
    toneMapped: false,
  }));
  const sign = new T.Mesh(geometry(new T.PlaneGeometry(5.25, 1.75)), signMaterial);
  sign.position.set(0, 4.22, -fenceDepth - 0.06);
  group.add(sign);
  const signFrame = new T.Mesh(geometry(new T.BoxGeometry(5.55, 2.04, 0.1)), darkMetal);
  signFrame.position.set(0, 4.22, -fenceDepth - 0.13);
  group.add(signFrame);
  // Render sign after frame despite being added first.
  sign.renderOrder = 2;

  options.parent?.add?.(group);
  let disposed = false;
  let elapsed = 0;

  const update = (dt = 0, energy = 0.35) => {
    if (disposed) return;
    elapsed += Math.max(0, Math.min(0.1, Number(dt) || 0));
    const intensity = clamp01(energy);
    for (let index = 0; index < activeLights.length; index++) {
      activeLights[index].intensity = (quality === "high" ? 8.5 : 6.5)
        * (0.96 + Math.sin(elapsed * 1.8 + index * 1.7) * 0.025);
    }
    // Animate a subset each frame on lower tiers. Matrix updates stay bounded.
    for (let index = 0; index < crowdBase.length; index += config.crowdAnimationStride) {
      const fan = crowdBase[index];
      const bounce = Math.max(0, Math.sin(elapsed * 3.2 + fan.phase)) * 0.035 * intensity;
      dummy.position.set(fan.x, fan.y + bounce, fan.z);
      dummy.scale.setScalar(fan.scale);
      dummy.rotation.set(0, fan.x > 0 ? -Math.PI / 2 : Math.PI / 2, Math.sin(elapsed * 1.7 + fan.phase) * 0.025 * intensity);
      dummy.updateMatrix();
      crowdBodies.setMatrixAt(index, dummy.matrix);
      dummy.position.y += 0.43 * fan.scale;
      dummy.updateMatrix();
      crowdHeads.setMatrixAt(index, dummy.matrix);
    }
    crowdBodies.instanceMatrix.needsUpdate = true;
    crowdHeads.instanceMatrix.needsUpdate = true;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    for (const texture of resources.textures) texture.dispose?.();
    for (const value of resources.geometries) value.dispose?.();
    for (const value of resources.materials) value.dispose?.();
    resources.textures.clear();
    resources.geometries.clear();
    resources.materials.clear();
    group.clear();
  };

  return {
    group,
    quality,
    update,
    dispose,
    get disposed() { return disposed; },
    stats: Object.freeze({
      crowd: config.crowd,
      skyline: config.skyline,
      dynamicLights: config.activeLights,
      shadowCastingLights: config.castShadows ? Math.min(2, config.activeLights) : 0,
      approximateDrawCalls: 18 + config.bleacherRows * 4 + config.activeLights,
    }),
  };
}

export default createNightPark;
