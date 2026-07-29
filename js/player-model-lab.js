import {
  BALL_HANDLER_GUARD_POSE,
  ProceduralPlayer,
} from "./engine.js?v=6.1";
import {
  createBasketballMesh,
  normalizeBasketballStyle,
} from "./basketball-visuals.js?v=1.1";
import {
  BASKETBALL_SHOE_STYLE_IDS,
  createBasketballShoe,
  normalizeBasketballShoeStyle,
} from "./basketball-shoes.js?v=1.1";
import {
  HAIR_STYLES,
  SKIN_TONES,
} from "./player-appearance.js?v=1.0";

const T = globalThis.THREE;
if (!T) throw new Error("Player Model Lab requires THREE.");

const $ = (selector) => document.querySelector(selector);
const stage = $("#lab-stage");
const scene = new T.Scene();
scene.background = new T.Color(0x05090d);
scene.fog = new T.Fog(0x05090d, 9, 19);

const camera = new T.PerspectiveCamera(36, 1, 0.05, 50);
const renderer = new T.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.domElement.setAttribute("aria-label", "Three.js production player model preview");
stage.appendChild(renderer.domElement);

const playerRoot = new T.Group();
scene.add(playerRoot);
const harnessEngine = {
  T,
  _nextPlayerId: 1,
  playerRoot,
  generatedTextures: [],
  elapsed: 0,
  fixedAccumulator: 0,
  ball: { owner: null, position: new T.Vector3() },
  events: { emit() {} },
};

const hemisphere = new T.HemisphereLight(0xc8e7ff, 0x141016, 1.35);
scene.add(hemisphere);
const key = new T.DirectionalLight(0xffeddb, 3.4);
key.position.set(4.5, 7.5, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);
const fill = new T.DirectionalLight(0x5edfff, 1.65);
fill.position.set(-5, 3.6, 4);
scene.add(fill);
const rim = new T.SpotLight(0xff7c52, 22, 15, 0.58, 0.75, 1.4);
rim.position.set(3.5, 5.5, -4.5);
rim.target.position.set(0, 1, 0);
scene.add(rim, rim.target);

const floor = new T.Mesh(
  new T.CircleGeometry(4.8, 72),
  new T.MeshStandardMaterial({ color: 0x101a20, roughness: 0.56, metalness: 0.16 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const floorRing = new T.Mesh(
  new T.RingGeometry(2.72, 2.75, 80),
  new T.MeshBasicMaterial({ color: 0x2dbed3, transparent: true, opacity: 0.36 }),
);
floorRing.rotation.x = -Math.PI / 2;
floorRing.position.y = 0.006;
scene.add(floorRing);

const grid = new T.GridHelper(8, 16, 0x318d9b, 0x183943);
grid.position.y = 0.008;
grid.material.transparent = true;
grid.material.opacity = 0.28;
scene.add(grid);

const guideRoot = new T.Group();
const guideMaterial = new T.LineBasicMaterial({
  color: 0x58dff2,
  transparent: true,
  opacity: 0.58,
});
const guideLine = new T.Line(
  new T.BufferGeometry().setFromPoints([
    new T.Vector3(-1.05, 0, 0),
    new T.Vector3(-1.05, 2.2, 0),
  ]),
  guideMaterial,
);
guideRoot.add(guideLine);
for (let height = 0; height <= 2.2; height += 0.2) {
  const width = height % 1 < 0.01 ? 0.18 : 0.09;
  guideRoot.add(new T.Line(
    new T.BufferGeometry().setFromPoints([
      new T.Vector3(-1.05 - width, height, 0),
      new T.Vector3(-1.05 + width, height, 0),
    ]),
    guideMaterial,
  ));
}
scene.add(guideRoot);

const ATHLETES = Object.freeze([
  {
    id: "classic",
    name: "Classic Guard",
    height: 1.86,
    jerseyNumber: 7,
    hairStyle: "crop",
    headShape: "round",
    skinColor: 0x9d6548,
    jerseyColor: 0x22cfe8,
    trimColor: 0x102d47,
    shoeColor: 0xf5fbff,
  },
  {
    id: "highTop",
    name: "High-Top Wing",
    height: 1.96,
    jerseyNumber: 13,
    hairStyle: "highTop",
    headShape: "long",
    skinColor: 0x75442f,
    jerseyColor: 0xff6846,
    trimColor: 0xffcf62,
    shoeColor: 0xffeee6,
  },
  {
    id: "braided",
    name: "Braided Forward",
    height: 2.02,
    jerseyNumber: 24,
    hairStyle: "braids",
    headShape: "round",
    skinColor: 0x4f2f25,
    jerseyColor: 0x8d62ff,
    trimColor: 0x52f1cf,
    shoeColor: 0xece8ff,
  },
  {
    id: "fade",
    name: "Fade Center",
    height: 2.09,
    jerseyNumber: 41,
    hairStyle: "fade",
    headShape: "wide",
    skinColor: 0xc88a68,
    jerseyColor: 0x253546,
    trimColor: 0xd9f5ff,
    shoeColor: 0xffb84b,
  },
  {
    id: "short",
    name: "5'6\" Guard",
    height: 1.68,
    jerseyNumber: 5,
    hairStyle: "waves",
    headShape: "round",
    skinColor: 0xf0c5aa,
    jerseyColor: 0x22cfe8,
    trimColor: 0x102d47,
    shoeColor: 0xf5fbff,
  },
  {
    id: "tall",
    name: "7'2\" Forward",
    height: 2.18,
    jerseyNumber: 32,
    hairStyle: "locs",
    headShape: "long",
    skinColor: 0x543225,
    jerseyColor: 0xff6846,
    trimColor: 0xffcf62,
    shoeColor: 0xffeee6,
  },
]);

const query = new URLSearchParams(location.search);
const selectedBallStyle = normalizeBasketballStyle(query.get("ball"));
const selectedShoeStyle = normalizeBasketballShoeStyle(query.get("shoe"));
const basketballPrototype = createBasketballMesh(T, 0.12, {
  anisotropy: renderer.capabilities.getMaxAnisotropy?.() || 1,
  textureRegistry: harnessEngine.generatedTextures,
  style: selectedBallStyle,
});

const playerEntries = ATHLETES.map((config) => {
  const player = new ProceduralPlayer(harnessEngine, {
    ...config,
    shoeStyleId: selectedShoeStyle,
    team: "home",
    controlled: false,
    isAI: false,
    position: new T.Vector3(),
  });
  player.marker.visible = false;
  const ball = basketballPrototype.clone();
  scene.add(ball);
  return { config, player, ball };
});

const views = Object.freeze({
  front: { azimuth: 0, elevation: 0.08, distance: 5.4 },
  "three-quarter": { azimuth: -0.64, elevation: 0.1, distance: 5.15 },
  profile: { azimuth: -Math.PI / 2, elevation: 0.08, distance: 5.4 },
  "hand-front": { azimuth: 0, elevation: 0.03, distance: 1.08, focus: "hand" },
  "hand-profile": { azimuth: -Math.PI / 2, elevation: 0.03, distance: 1.08, focus: "hand" },
  "legs-front": { azimuth: 0, elevation: 0.02, distance: 2.35, focus: "legs" },
  "legs-three-quarter": { azimuth: -0.64, elevation: 0.04, distance: 2.25, focus: "legs" },
  back: { azimuth: Math.PI, elevation: 0.08, distance: 5.4 },
  top: { azimuth: 0, elevation: Math.PI / 2, distance: 4.8 },
  outsole: { azimuth: 0, elevation: -Math.PI / 2, distance: 4.8 },
});
const poseIds = ["neutral", "defense", "handle", "gather", "release", "layup", "celebrate"];
const athleteIds = ATHLETES.map((athlete) => athlete.id);
const state = {
  subject: ["basketball", "shoe"].includes(query.get("subject")) ? query.get("subject") : "player",
  shoeStyleId: selectedShoeStyle,
  athlete: athleteIds.includes(query.get("athlete")) ? query.get("athlete") : "classic",
  pose: poseIds.includes(query.get("pose")) ? query.get("pose") : "neutral",
  view: views[query.get("view")] ? query.get("view") : "front",
  limb: ["left-arm", "right-arm", "left-leg", "right-leg"].includes(query.get("limb"))
    ? query.get("limb")
    : "right-arm",
  compare: ["1", "heights"].includes(query.get("compare")),
  comparisonKind: query.get("compare") === "heights" ? "heights" : "roster",
  wireframe: false,
  turntable: false,
  guides: true,
  shortsMotion: false,
  shortsMotionPreset: "idle",
  shortsParameters: {
    length: 0.45,
    flare: 0.045,
    sideVent: 0.055,
    sway: 0.052,
    stiffness: 48,
    damping: 10.5,
  },
  azimuthOffset: 0,
  elevationOffset: 0,
  zoomOffset: 0,
};

function formatShortsValue(key, value) {
  if (["length", "flare", "sideVent", "sway"].includes(key)) {
    return `${Number(value).toFixed(3)} m`;
  }
  return Number(value).toFixed(key === "damping" ? 1 : 0);
}

function applyShortsParameters(parameters = state.shortsParameters) {
  state.shortsParameters = {
    ...state.shortsParameters,
    ...parameters,
  };
  playerEntries.forEach(({ player }) => player.setShortsParameters(state.shortsParameters));
  document.querySelectorAll("[data-shorts]").forEach((slider) => {
    const key = slider.dataset.shorts;
    slider.value = String(state.shortsParameters[key]);
    if (slider.nextElementSibling) {
      slider.nextElementSibling.value = formatShortsValue(key, state.shortsParameters[key]);
    }
  });
  const metrics = activeEntry().player.shortsMetrics();
  $("#lab-shorts-budget").value =
    `${metrics.drawCalls} draws · ${metrics.totalTriangles} tris · ` +
    `${metrics.dynamicVertices} verts/collisions · ${metrics.textures} textures`;
  return Object.freeze({ ...state.shortsParameters });
}

const basketballReviewBall = state.subject === "basketball"
  ? createBasketballMesh(T, 0.88, {
    anisotropy: renderer.capabilities.getMaxAnisotropy?.() || 1,
    textureRegistry: harnessEngine.generatedTextures,
    style: selectedBallStyle,
  })
  : null;
if (basketballReviewBall) {
  basketballReviewBall.position.y = 0.9;
  basketballReviewBall.rotation.set(-0.06, 0.02, -0.02);
  scene.add(basketballReviewBall);
  hemisphere.intensity = 0.72;
  key.intensity = 1.9;
  fill.intensity = 0.72;
  rim.intensity = 8;
  document.body.classList.add("basketball-review");
}

const shoeReview = state.subject === "shoe"
  ? createBasketballShoe(T, {
    styleId: state.shoeStyleId,
    shellColor: state.shoeStyleId === "court-classic" ? 0x224960 : 0xeaf7ff,
    accentColor: state.shoeStyleId === "court-classic" ? 0x102d47 : 0x63e8ff,
    detail: "high",
    side: -1,
  })
  : null;
if (shoeReview) {
  shoeReview.root.position.y = 0.06;
  shoeReview.root.scale.setScalar(state.shoeStyleId === "court-classic" ? 1.85 : 2.35);
  scene.add(shoeReview.root);
  hemisphere.intensity = 0.82;
  key.intensity = 2.7;
  fill.intensity = 1.05;
  rim.intensity = 12;
  const underLight = new T.DirectionalLight(0x9edfff, 1.8);
  underLight.position.set(-1.5, -4, 2.5);
  scene.add(underLight);
  document.body.classList.add("shoe-review");
}

const POSE_DRAFT_STORAGE_KEY = "nova-court.player-lab.pose-drafts.v2";
const LIMB_DEFINITIONS = Object.freeze({
  "left-arm": Object.freeze({
    type: "arm",
    index: 1,
    rootLabel: "SHOULDER",
    bendLabel: "ELBOW",
    endLabel: "HAND",
  }),
  "right-arm": Object.freeze({
    type: "arm",
    index: 0,
    rootLabel: "SHOULDER",
    bendLabel: "ELBOW",
    endLabel: "HAND",
  }),
  "left-leg": Object.freeze({
    type: "leg",
    index: 1,
    rootLabel: "HIP",
    bendLabel: "KNEE",
    endLabel: "FOOT",
  }),
  "right-leg": Object.freeze({
    type: "leg",
    index: 0,
    rootLabel: "HIP",
    bendLabel: "KNEE",
    endLabel: "FOOT",
  }),
});

function loadPoseDrafts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(POSE_DRAFT_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let poseDrafts = loadPoseDrafts();
const toDegrees = (radians) => Math.round(T.MathUtils.radToDeg(radians) * 10) / 10;
const toRadians = (degrees) => T.MathUtils.degToRad(Number(degrees) || 0);
const roundCoordinate = (value) => Math.round(value * 1000) / 1000;
const DEFENSIVE_POSE_ROTATIONS = BALL_HANDLER_GUARD_POSE;

function activeEntry() {
  return playerEntries[athleteIds.indexOf(state.athlete)] || playerEntries[0];
}

function limbNodes(player, limbId = state.limb) {
  const definition = LIMB_DEFINITIONS[limbId];
  const limb = definition.type === "arm"
    ? player.arms[definition.index]
    : player.legs[definition.index];
  return {
    definition,
    upper: definition.type === "arm" ? limb.shoulder : limb.hip,
    bend: definition.type === "arm" ? limb.elbow : limb.knee,
    end: definition.type === "arm" ? limb.hand : limb.outsole,
  };
}

function validRotation(values) {
  return Array.isArray(values)
    && values.length === 3
    && values.every((value) => Number.isFinite(Number(value)));
}

function applyPoseDraft(player, pose) {
  const draft = poseDrafts[pose];
  if (!draft || typeof draft !== "object") return;
  for (const limbId of Object.keys(LIMB_DEFINITIONS)) {
    const limbDraft = draft[limbId];
    if (!limbDraft) continue;
    const nodes = limbNodes(player, limbId);
    if (validRotation(limbDraft.upper)) {
      nodes.upper.rotation.set(...limbDraft.upper.map(toRadians));
    }
    if (validRotation(limbDraft.bend)) {
      nodes.bend.rotation.set(...limbDraft.bend.map(toRadians));
    }
  }
  player.root.updateMatrixWorld(true);
}

function captureLimbDraft(player, limbId = state.limb) {
  const nodes = limbNodes(player, limbId);
  poseDrafts[state.pose] ||= {};
  poseDrafts[state.pose][limbId] = {
    upper: ["x", "y", "z"].map((axis) => toDegrees(nodes.upper.rotation[axis])),
    bend: ["x", "y", "z"].map((axis) => toDegrees(nodes.bend.rotation[axis])),
  };
}

function makeMarker(color, radius) {
  const marker = new T.Mesh(
    new T.SphereGeometry(radius, 12, 8),
    new T.MeshBasicMaterial({
      color,
      depthTest: false,
      transparent: true,
      opacity: 0.92,
      toneMapped: false,
    }),
  );
  marker.renderOrder = 20;
  scene.add(marker);
  return marker;
}

const rootJointMarker = makeMarker(0x59ebff, 0.035);
const bendJointMarker = makeMarker(0xffd166, 0.04);
const endJointMarker = makeMarker(0xff5b91, 0.045);
const jointGuidePositions = new Float32Array(9);
const jointGuideGeometry = new T.BufferGeometry();
jointGuideGeometry.setAttribute("position", new T.BufferAttribute(jointGuidePositions, 3));
const jointGuideLine = new T.Line(
  jointGuideGeometry,
  new T.LineBasicMaterial({
    color: 0xd8f8ff,
    depthTest: false,
    transparent: true,
    opacity: 0.72,
    toneMapped: false,
  }),
);
jointGuideLine.renderOrder = 19;
scene.add(jointGuideLine);

const rootWorld = new T.Vector3();
const bendWorld = new T.Vector3();
const endWorld = new T.Vector3();

function resetRig(player) {
  player.hips.position.set(0, player.baseHipHeight, 0);
  player.hips.rotation.set(0, 0, 0);
  player.root.rotation.set(0, 0, 0);
  for (const arm of player.arms) {
    arm.shoulder.rotation.set(0.05, 0, arm.side * -0.09);
    arm.elbow.rotation.set(-0.08, 0, 0);
    arm.hand.rotation.set(0, 0, 0);
  }
  for (const leg of player.legs) {
    leg.hip.rotation.set(0, 0, 0);
    leg.knee.rotation.set(0.04, 0, 0);
  }
}

function applyPose(player, pose) {
  resetRig(player);
  const [rightArm, leftArm] = player.arms;
  const [rightLeg, leftLeg] = player.legs;
  if (pose === "defense") {
    player.hips.position.y -= 0.12;
    player.hips.rotation.x = -0.08;
    const hipRotation = DEFENSIVE_POSE_ROTATIONS.hip.map(toRadians);
    const kneeRotation = DEFENSIVE_POSE_ROTATIONS.knee.map(toRadians);
    leftArm.shoulder.rotation.set(...DEFENSIVE_POSE_ROTATIONS.leftShoulder.map(toRadians));
    leftArm.elbow.rotation.set(...DEFENSIVE_POSE_ROTATIONS.leftElbow.map(toRadians));
    rightArm.shoulder.rotation.set(...DEFENSIVE_POSE_ROTATIONS.rightShoulder.map(toRadians));
    rightArm.elbow.rotation.set(...DEFENSIVE_POSE_ROTATIONS.rightElbow.map(toRadians));
    for (const leg of [leftLeg, rightLeg]) {
      leg.hip.rotation.set(...hipRotation);
      leg.knee.rotation.set(...kneeRotation);
    }
  } else if (pose === "handle") {
    player.hips.position.y -= 0.1;
    player.hips.rotation.set(-0.12, 0.16, -0.08);
    leftLeg.hip.rotation.z = 0.2;
    rightLeg.hip.rotation.z = -0.15;
    leftLeg.knee.rotation.x = 0.28;
    rightLeg.knee.rotation.x = 0.38;
    rightArm.shoulder.rotation.set(-0.62, 0, -0.22);
    rightArm.elbow.rotation.x = -0.74;
    leftArm.shoulder.rotation.set(-0.42, 0, 0.34);
    leftArm.elbow.rotation.x = -0.42;
  } else if (pose === "gather") {
    player.hips.position.y -= 0.08;
    player.hips.rotation.x = 0.07;
    leftLeg.knee.rotation.x = 0.36;
    rightLeg.knee.rotation.x = 0.36;
    leftArm.shoulder.rotation.set(-1.32, 0, 0.2);
    rightArm.shoulder.rotation.set(-1.46, 0, -0.12);
    leftArm.elbow.rotation.x = -1.05;
    rightArm.elbow.rotation.x = -1.14;
  } else if (pose === "release") {
    player.hips.position.y += 0.22;
    player.hips.rotation.x = -0.04;
    leftLeg.hip.rotation.x = -0.08;
    rightLeg.hip.rotation.x = 0.05;
    leftLeg.knee.rotation.x = 0.16;
    rightLeg.knee.rotation.x = 0.1;
    leftArm.shoulder.rotation.set(-2.48, 0, 0.1);
    rightArm.shoulder.rotation.set(-2.82, 0, -0.08);
    leftArm.elbow.rotation.x = -0.38;
    rightArm.elbow.rotation.x = -0.08;
    rightArm.hand.rotation.x = -0.72;
  } else if (pose === "layup") {
    player.hips.position.y += 0.2;
    player.hips.rotation.set(-0.1, -0.18, 0.08);
    leftLeg.hip.rotation.x = -0.58;
    leftLeg.knee.rotation.x = 0.82;
    rightLeg.hip.rotation.x = 0.16;
    rightLeg.knee.rotation.x = 0.18;
    rightArm.shoulder.rotation.set(-2.85, 0, -0.08);
    rightArm.elbow.rotation.x = -0.14;
    leftArm.shoulder.rotation.set(-0.75, 0, 0.55);
    leftArm.elbow.rotation.x = -0.38;
  } else if (pose === "celebrate") {
    player.hips.rotation.z = -0.05;
    leftArm.shoulder.rotation.set(-2.5, 0, 0.26);
    rightArm.shoulder.rotation.set(-1.55, 0, -0.52);
    leftArm.elbow.rotation.x = -0.22;
    rightArm.elbow.rotation.x = -0.5;
    leftLeg.hip.rotation.z = 0.08;
    rightLeg.hip.rotation.z = -0.08;
  }
  player.root.updateMatrixWorld(true);
}

function ballVisibleForPose(pose) {
  return ["handle", "gather", "release", "layup"].includes(pose);
}

function positionBall(entry) {
  const { player, ball } = entry;
  ball.visible = player.root.visible && ballVisibleForPose(state.pose);
  if (!ball.visible) return;
  const leftHandPosition = player.arms[1].hand.getWorldPosition(new T.Vector3());
  const rightHandPosition = player.arms[0].hand.getWorldPosition(new T.Vector3());
  ball.position.copy(rightHandPosition);
  if (state.pose === "handle") ball.position.add(new T.Vector3(0.04, -0.34, 0.1));
  else if (state.pose === "gather") {
    ball.position.lerp(leftHandPosition, 0.5).add(new T.Vector3(0, 0.05, 0.12));
  } else if (state.pose === "release") {
    ball.position.lerp(leftHandPosition, 0.5).add(new T.Vector3(0, 0.1, 0.06));
  } else ball.position.add(new T.Vector3(0, 0.08, 0.05));
}

function formatCoordinates(vector) {
  return [vector.x, vector.y, vector.z]
    .map((value) => roundCoordinate(value).toFixed(3))
    .join(", ");
}

function updateJointGuide() {
  const entry = activeEntry();
  const nodes = limbNodes(entry.player);
  entry.player.root.updateMatrixWorld(true);
  nodes.upper.getWorldPosition(rootWorld);
  nodes.bend.getWorldPosition(bendWorld);
  nodes.end.getWorldPosition(endWorld);

  const show = state.guides && !state.compare && entry.player.root.visible;
  rootJointMarker.visible = show;
  bendJointMarker.visible = show;
  endJointMarker.visible = show;
  jointGuideLine.visible = show;
  if (show) {
    rootJointMarker.position.copy(rootWorld);
    bendJointMarker.position.copy(bendWorld);
    endJointMarker.position.copy(endWorld);
    jointGuidePositions.set([
      rootWorld.x, rootWorld.y, rootWorld.z,
      bendWorld.x, bendWorld.y, bendWorld.z,
      endWorld.x, endWorld.y, endWorld.z,
    ]);
    jointGuideGeometry.attributes.position.needsUpdate = true;
    jointGuideGeometry.computeBoundingSphere();
  }

  const definition = nodes.definition;
  $("#lab-root-label").textContent = definition.rootLabel;
  $("#lab-bend-label").textContent = definition.bendLabel;
  $("#lab-end-label").textContent = definition.endLabel;
  $("#lab-root-coordinates").value = formatCoordinates(rootWorld);
  $("#lab-bend-coordinates").value = formatCoordinates(bendWorld);
  $("#lab-end-coordinates").value = formatCoordinates(endWorld);
}

function syncPoseEditor() {
  const entry = activeEntry();
  const nodes = limbNodes(entry.player);
  const definition = nodes.definition;
  $("#lab-limb").value = state.limb;
  $("#lab-upper-legend").textContent = `${definition.rootLabel} ROTATION`;
  $("#lab-bend-legend").textContent = `${definition.bendLabel} ROTATION`;
  document.querySelectorAll("[data-joint][data-axis]").forEach((slider) => {
    const joint = slider.dataset.joint === "upper" ? nodes.upper : nodes.bend;
    const value = Math.round(toDegrees(joint.rotation[slider.dataset.axis]));
    slider.value = String(value);
    if (slider.nextElementSibling) slider.nextElementSibling.value = `${value}°`;
  });
  updateJointGuide();
}

function vectorReport(vector) {
  return Object.freeze({
    x: roundCoordinate(vector.x),
    y: roundCoordinate(vector.y),
    z: roundCoordinate(vector.z),
  });
}

function limbReport(player, limbId) {
  const nodes = limbNodes(player, limbId);
  const root = nodes.upper.getWorldPosition(new T.Vector3());
  const bend = nodes.bend.getWorldPosition(new T.Vector3());
  const end = nodes.end.getWorldPosition(new T.Vector3());
  return Object.freeze({
    labels: Object.freeze({
      root: nodes.definition.rootLabel,
      bend: nodes.definition.bendLabel,
      end: nodes.definition.endLabel,
    }),
    rotationsDegrees: Object.freeze({
      upper: Object.freeze({
        x: toDegrees(nodes.upper.rotation.x),
        y: toDegrees(nodes.upper.rotation.y),
        z: toDegrees(nodes.upper.rotation.z),
      }),
      bend: Object.freeze({
        x: toDegrees(nodes.bend.rotation.x),
        y: toDegrees(nodes.bend.rotation.y),
        z: toDegrees(nodes.bend.rotation.z),
      }),
    }),
    worldMeters: Object.freeze({
      root: vectorReport(root),
      bend: vectorReport(bend),
      end: vectorReport(end),
    }),
  });
}

function createPoseReport() {
  const entry = activeEntry();
  entry.player.root.updateMatrixWorld(true);
  const limbs = {};
  for (const limbId of Object.keys(LIMB_DEFINITIONS)) {
    limbs[limbId] = limbReport(entry.player, limbId);
  }
  return Object.freeze({
    schema: "nova-court-player-pose-v1",
    athlete: state.athlete,
    pose: state.pose,
    selectedLimb: state.limb,
    camera: state.view,
    units: Object.freeze({ position: "meters", rotation: "degrees" }),
    limbs: Object.freeze(limbs),
  });
}

function setEditorStatus(message) {
  $("#lab-editor-status").value = message;
}

function persistPoseDrafts() {
  try {
    localStorage.setItem(POSE_DRAFT_STORAGE_KEY, JSON.stringify(poseDrafts));
    setEditorStatus(`${state.pose.toUpperCase()} saved on this device.`);
    return true;
  } catch {
    setEditorStatus("Could not save this pose in the browser.");
    return false;
  }
}

async function copyPoseReport() {
  const text = JSON.stringify(createPoseReport(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.select();
    document.execCommand("copy");
    fallback.remove();
  }
  setEditorStatus(`Copied ${state.pose.toUpperCase()} coordinates for all four limbs.`);
}

function applySceneState() {
  const activeIndex = athleteIds.indexOf(state.athlete);
  const heightComparison = state.compare && state.comparisonKind === "heights";
  const comparisonIds = heightComparison ? ["short", "tall"] : athleteIds;
  playerEntries.forEach((entry, index) => {
    const comparisonIndex = comparisonIds.indexOf(entry.config.id);
    const visible = state.subject === "player"
      && (state.compare ? comparisonIndex >= 0 : index === activeIndex);
    entry.player.root.visible = visible;
    entry.ball.visible = visible && ballVisibleForPose(state.pose);
    entry.player.root.position.set(
      state.compare ? (comparisonIndex - (comparisonIds.length - 1) / 2) * (heightComparison ? 1.35 : 1.05) : 0,
      0,
      state.compare ? Math.abs(comparisonIndex - (comparisonIds.length - 1) / 2) * 0.08 : 0,
    );
    applyPose(entry.player, state.pose);
    applyPoseDraft(entry.player, state.pose);
    entry.player.root.traverse((node) => {
      if (node.material && "wireframe" in node.material) node.material.wireframe = state.wireframe;
    });
    positionBall(entry);
  });
  if (basketballReviewBall) basketballReviewBall.visible = true;
  if (shoeReview) {
    shoeReview.root.visible = true;
    shoeReview.root.traverse((node) => {
      if (node.material && "wireframe" in node.material) node.material.wireframe = state.wireframe;
    });
  }
  guideRoot.visible = state.subject === "player" && state.guides && !state.compare;
  grid.visible = state.subject === "player" && state.guides;
  floorRing.visible = state.subject === "player";
  floor.visible = state.subject !== "shoe" || state.view !== "outsole";
  updateCaptureName();
  updateViewButtons();
  syncControls();
  syncPoseEditor();
}

function updateCamera() {
  const preset = views[state.view];
  const azimuth = preset.azimuth + state.azimuthOffset;
  const elevation = preset.elevation + state.elevationOffset;
  if (state.subject === "basketball") {
    const target = new T.Vector3(0, 0.9, 0);
    const distance = 4.05 + state.zoomOffset;
    camera.position.set(
      Math.sin(azimuth) * Math.cos(elevation) * distance,
      target.y + Math.sin(elevation) * distance,
      Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    camera.lookAt(target);
    return;
  }
  if (state.subject === "shoe") {
    const target = state.shoeStyleId === "court-classic"
      ? new T.Vector3(0, 0.2, 0)
      : new T.Vector3(0, 0.25, 0.06);
    const distance = (state.view === "top" || state.view === "outsole" ? 1.5 : 1.18)
      + state.zoomOffset;
    if (state.view === "top" || state.view === "outsole") {
      const direction = state.view === "top" ? 1 : -1;
      camera.position.set(0.04, target.y + direction * distance, target.z + 0.035);
      camera.up.set(0, 0, state.view === "top" ? -1 : 1);
    } else {
      camera.up.set(0, 1, 0);
      camera.position.set(
        Math.sin(azimuth) * Math.cos(elevation) * distance,
        target.y + Math.sin(elevation) * distance,
        Math.cos(azimuth) * Math.cos(elevation) * distance,
      );
    }
    camera.lookAt(target);
    return;
  }
  camera.up.set(0, 1, 0);
  const activePlayer = activeEntry().player;
  if (!state.compare && preset.focus) {
    activePlayer.root.updateMatrixWorld(true);
    let target;
    if (preset.focus === "hand") {
      const handIndex = state.limb === "left-arm" ? 1 : 0;
      target = activePlayer.arms[handIndex].hand.getWorldPosition(new T.Vector3());
    } else {
      target = new T.Vector3(0, 0.58, 0);
    }
    const distance = preset.distance + state.zoomOffset;
    camera.position.set(
      target.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      target.y + Math.sin(elevation) * distance,
      target.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    camera.lookAt(target);
    return;
  }
  const distance = preset.distance + state.zoomOffset
    + (state.compare ? (state.comparisonKind === "heights" ? 0.65 : 2.6) : 0);
  const compareTargetX = state.view === "back" ? -0.42 : 0.42;
  const target = new T.Vector3(
    state.compare ? compareTargetX : 0,
    state.compare ? 1.05 : 1.02,
    0,
  );
  camera.position.set(
    Math.sin(azimuth) * Math.cos(elevation) * distance,
    target.y + Math.sin(elevation) * distance,
    Math.cos(azimuth) * Math.cos(elevation) * distance,
  );
  camera.lookAt(target);
}

function updateCaptureName() {
  if (state.subject === "basketball") {
    $("#lab-capture-name").textContent = `basketball-${selectedBallStyle}-${state.view}.png`;
    return;
  }
  if (state.subject === "shoe") {
    $("#lab-capture-name").textContent = `${state.shoeStyleId}-shoe-${state.view}.png`;
    return;
  }
  const athlete = state.compare ? "roster" : state.athlete;
  if (state.compare && state.comparisonKind === "heights") {
    $("#lab-capture-name").textContent = `npc-height-range-${state.pose}-${state.view}-comparison.png`;
    return;
  }
  const focus = views[state.view].focus ? views[state.view].focus : "full-body";
  $("#lab-capture-name").textContent =
    `npc-${athlete}-${state.pose}-${state.view}-${focus}.png`;
}

function updateViewButtons() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === state.view));
  });
}

function syncControls() {
  $("#lab-athlete").value = state.athlete;
  $("#lab-pose").value = state.pose;
  $("#lab-view").value = state.view;
  $("#lab-compare").checked = state.compare;
  $("#lab-wireframe").checked = state.wireframe;
  $("#lab-turntable").checked = state.turntable;
  $("#lab-guides").checked = state.guides;
  $("#lab-shorts-motion").checked = state.shortsMotion;
  $("#lab-shorts-motion-preset").value = state.shortsMotionPreset;
  $("#lab-shoe-style").value = state.shoeStyleId;
}

function selectAthlete(direction) {
  const current = athleteIds.indexOf(state.athlete);
  state.athlete = athleteIds[(current + direction + athleteIds.length) % athleteIds.length];
  applySceneState();
}

function setView(view) {
  if (!views[view]) return false;
  state.view = view;
  state.azimuthOffset = 0;
  state.elevationOffset = 0;
  state.zoomOffset = 0;
  applySceneState();
  updateCamera();
  return true;
}

function saveCapture() {
  const name = $("#lab-capture-name").textContent;
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    link.download = name;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, "image/png");
}

$("#lab-athlete").addEventListener("change", (event) => {
  state.athlete = event.target.value;
  state.compare = false;
  applySceneState();
});
$("#lab-pose").addEventListener("change", (event) => {
  state.pose = event.target.value;
  applySceneState();
  setEditorStatus(`Editing ${state.pose.toUpperCase()} · drafts are pose-specific.`);
});
$("#lab-view").addEventListener("change", (event) => setView(event.target.value));
$("#lab-shoe-style").addEventListener("change", (event) => {
  const styleId = normalizeBasketballShoeStyle(event.target.value);
  const next = new URL(location.href);
  next.searchParams.set("shoe", styleId);
  location.assign(next);
});
$("#lab-compare").addEventListener("change", (event) => {
  state.compare = event.target.checked;
  applySceneState();
  updateCamera();
});
$("#lab-wireframe").addEventListener("change", (event) => {
  state.wireframe = event.target.checked;
  applySceneState();
});
$("#lab-turntable").addEventListener("change", (event) => {
  state.turntable = event.target.checked;
});
$("#lab-guides").addEventListener("change", (event) => {
  state.guides = event.target.checked;
  applySceneState();
});
$("#lab-prev").addEventListener("click", () => selectAthlete(-1));
$("#lab-next").addEventListener("click", () => selectAthlete(1));
$("#lab-reset").addEventListener("click", () => setView(state.view));
$("#lab-capture").addEventListener("click", saveCapture);
$("#lab-shorts-motion").addEventListener("change", (event) => {
  state.shortsMotion = event.target.checked;
  applySceneState();
});
$("#lab-shorts-motion-preset").addEventListener("change", (event) => {
  state.shortsMotionPreset = event.target.value;
  const poseForPreset = {
    idle: "neutral",
    defense: "defense",
    run: "neutral",
    crossover: "handle",
  };
  state.pose = poseForPreset[state.shortsMotionPreset] || state.pose;
  applySceneState();
});
document.querySelectorAll("[data-shorts]").forEach((slider) => {
  slider.addEventListener("input", () => {
    applyShortsParameters({ [slider.dataset.shorts]: Number(slider.value) });
  });
});
$("#lab-reset-shorts").addEventListener("click", () => {
  applyShortsParameters({
    length: 0.45,
    flare: 0.045,
    sideVent: 0.055,
    sway: 0.052,
    stiffness: 48,
    damping: 10.5,
  });
});
document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});
$("#lab-limb").addEventListener("change", (event) => {
  state.limb = event.target.value;
  syncPoseEditor();
  setEditorStatus(`Editing ${state.limb.toUpperCase()} in ${state.pose.toUpperCase()}.`);
});
document.querySelectorAll("[data-joint][data-axis]").forEach((slider) => {
  slider.addEventListener("input", (event) => {
    const entry = activeEntry();
    const nodes = limbNodes(entry.player);
    const joint = event.target.dataset.joint === "upper" ? nodes.upper : nodes.bend;
    joint.rotation[event.target.dataset.axis] = toRadians(event.target.value);
    entry.player.root.updateMatrixWorld(true);
    captureLimbDraft(entry.player);
    applySceneState();
    setEditorStatus(`${state.pose.toUpperCase()} changed · save or copy when ready.`);
  });
});
$("#lab-reset-limb").addEventListener("click", () => {
  if (poseDrafts[state.pose]) {
    delete poseDrafts[state.pose][state.limb];
    if (!Object.keys(poseDrafts[state.pose]).length) delete poseDrafts[state.pose];
  }
  applySceneState();
  setEditorStatus(`${state.limb.toUpperCase()} reset to the authored ${state.pose} pose.`);
});
$("#lab-reset-pose").addEventListener("click", () => {
  delete poseDrafts[state.pose];
  applySceneState();
  setEditorStatus(`${state.pose.toUpperCase()} reset to its authored pose.`);
});
$("#lab-save-pose").addEventListener("click", persistPoseDrafts);
$("#lab-copy-pose").addEventListener("click", copyPoseReport);

let dragging = false;
let pointerX = 0;
let pointerY = 0;
renderer.domElement.addEventListener("pointerdown", (event) => {
  dragging = true;
  pointerX = event.clientX;
  pointerY = event.clientY;
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  state.azimuthOffset -= (event.clientX - pointerX) * 0.008;
  state.elevationOffset = Math.max(
    -0.28,
    Math.min(0.38, state.elevationOffset + (event.clientY - pointerY) * 0.005),
  );
  pointerX = event.clientX;
  pointerY = event.clientY;
});
renderer.domElement.addEventListener("pointerup", (event) => {
  dragging = false;
  renderer.domElement.releasePointerCapture(event.pointerId);
});
renderer.domElement.addEventListener("wheel", (event) => {
  event.preventDefault();
  state.zoomOffset = Math.max(
    -1.6,
    Math.min(3.2, state.zoomOffset + event.deltaY * 0.003),
  );
}, { passive: false });

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}

function updateShortsMotionPreview(dt, now) {
  if (!state.shortsMotion) return;
  const phase = now / 1000;
  playerEntries.forEach((entry) => {
    if (!entry.player.root.visible) return;
    const player = entry.player;
    const preset = state.shortsMotionPreset;
    const basePose = preset === "defense" ? "defense"
      : preset === "crossover" ? "handle" : "neutral";
    applyPose(player, basePose);
    const stride = Math.sin(phase * 8.2);
    let speedRatio = 0.08;
    let lateralSpeed = 0;
    let forwardSpeed = 0;
    let defenseBlend = 0;
    if (preset === "run") {
      player.legs[0].hip.rotation.x = stride * 0.58;
      player.legs[1].hip.rotation.x = -stride * 0.58;
      player.legs[0].knee.rotation.x = Math.max(0.04, -stride * 0.62);
      player.legs[1].knee.rotation.x = Math.max(0.04, stride * 0.62);
      speedRatio = 1;
      forwardSpeed = 4.35;
    } else if (preset === "defense") {
      const shuffle = Math.sin(phase * 4.4);
      player.legs[0].hip.rotation.x += shuffle * 0.07;
      player.legs[1].hip.rotation.x -= shuffle * 0.07;
      speedRatio = 0.52;
      lateralSpeed = Math.cos(phase * 4.4) * 3.2;
      defenseBlend = 1;
    } else if (preset === "crossover") {
      const cross = Math.sin(phase * 5.3);
      player.legs[0].hip.rotation.z -= cross * 0.15;
      player.legs[1].hip.rotation.z += cross * 0.15;
      speedRatio = 0.68;
      lateralSpeed = Math.cos(phase * 5.3) * 4;
      forwardSpeed = Math.sin(phase * 2.65) * 1.2;
      defenseBlend = 0.25;
    }
    player.shortsRig.update(dt, {
      speedRatio,
      lateralSpeed,
      forwardSpeed,
      defenseBlend,
      leftHipPitch: player.legs[0].hip.rotation.x,
      rightHipPitch: player.legs[1].hip.rotation.x,
      leftHipYaw: player.legs[0].hip.rotation.y,
      rightHipYaw: player.legs[1].hip.rotation.y,
      leftHipRoll: player.legs[0].hip.rotation.z,
      rightHipRoll: player.legs[1].hip.rotation.z,
    });
    player.root.updateMatrixWorld(true);
  });
  updateJointGuide();
}

new ResizeObserver(resize).observe(stage);
resize();
applySceneState();
applyShortsParameters();
updateCamera();

let lastFrame = performance.now();
let metricTime = lastFrame;
let metricFrames = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.turntable && !dragging) state.azimuthOffset += dt * 0.32;
  updateShortsMotionPreview(dt, now);
  updateCamera();
  playerEntries.forEach((entry) => positionBall(entry));
  renderer.render(scene, camera);
  metricFrames += 1;
  if (now - metricTime >= 500) {
    const fps = Math.round(metricFrames * 1000 / (now - metricTime));
    $("#lab-fps").textContent = String(fps);
    $("#lab-draws").textContent = String(renderer.info.render.calls);
    $("#lab-tris").textContent = renderer.info.render.triangles.toLocaleString();
    $("#lab-textures").textContent = String(renderer.info.memory.textures);
    metricTime = now;
    metricFrames = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

globalThis.__NOVA_PLAYER_LAB__ = Object.freeze({
  createBasketballReviewMesh(radius = 1, style = selectedBallStyle) {
    return createBasketballMesh(T, radius, {
      anisotropy: renderer.capabilities.getMaxAnisotropy?.() || 1,
      style: normalizeBasketballStyle(style),
    });
  },
  createShoeReviewMesh(options = {}) {
    return createBasketballShoe(T, {
      styleId: state.shoeStyleId,
      detail: "high",
      ...options,
    }).root;
  },
  setAthlete(id) {
    if (!athleteIds.includes(id)) return false;
    state.athlete = id;
    state.compare = false;
    applySceneState();
    return true;
  },
  setPose(id) {
    if (!poseIds.includes(id)) return false;
    state.pose = id;
    applySceneState();
    return true;
  },
  setLimb(id) {
    if (!LIMB_DEFINITIONS[id]) return false;
    state.limb = id;
    syncPoseEditor();
    return true;
  },
  setView,
  setComparison(value) {
    state.compare = Boolean(value);
    state.comparisonKind = "roster";
    applySceneState();
    updateCamera();
    return true;
  },
  setHeightComparison(value = true) {
    state.compare = Boolean(value);
    state.comparisonKind = "heights";
    applySceneState();
    updateCamera();
    return true;
  },
  setShortsParameters(parameters) {
    return applyShortsParameters(parameters);
  },
  setShortsMotion(value, preset = state.shortsMotionPreset) {
    if (!["idle", "defense", "run", "crossover"].includes(preset)) return false;
    state.shortsMotion = Boolean(value);
    state.shortsMotionPreset = preset;
    syncControls();
    return true;
  },
  snapshot() {
    const shortsMetrics = activeEntry().player.shortsMetrics();
    return Object.freeze({
      subject: state.subject,
      ballStyle: selectedBallStyle,
      athlete: state.athlete,
      pose: state.pose,
      view: state.view,
      comparison: state.compare,
      captureName: $("#lab-capture-name").textContent,
      fps: Number($("#lab-fps").textContent),
      draws: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      shorts: Object.freeze({
        parameters: Object.freeze({ ...state.shortsParameters }),
        motion: state.shortsMotion,
        motionPreset: state.shortsMotionPreset,
        cost: shortsMetrics,
      }),
      shoe: shoeReview
        ? Object.freeze({
          model: state.shoeStyleId,
          inferredSurfaces: shoeReview.root.userData.sculptRuntime?.inferredSurfaces || [],
          cost: shoeReview.metrics,
        })
        : null,
      availableShoeStyles: BASKETBALL_SHOE_STYLE_IDS,
      availableHairStyles: HAIR_STYLES.map((style) => style.id),
      availableSkinTones: SKIN_TONES.map((tone) => tone.id),
      assetLoadStatus: "procedural-production-rig-ready",
    });
  },
  poseReport: createPoseReport,
});
