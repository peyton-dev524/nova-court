import {
  DRIBBLE_MOVE_CONFIG,
  ProceduralPlayer,
} from "./engine.js?v=6.1";
import { createBasketballMesh } from "./basketball-visuals.js?v=1.1";
import {
  DRIBBLE_NAMED_FRAMES,
  FEATURED_DRIBBLE_MOVES,
  featuredDribbleFrameName,
  sampleFeaturedDribbleMove,
} from "./dribble-animation.js?v=1.0";

const T = globalThis.THREE;
if (!T) throw new Error("Dribble Lab requires THREE.");

const $ = (selector) => document.querySelector(selector);
const stage = $("#dribble-stage");
const query = new URLSearchParams(location.search);
const initialMove = FEATURED_DRIBBLE_MOVES.includes(query.get("move"))
  ? query.get("move")
  : "crossover";

const state = {
  move: initialMove,
  progress: Math.max(0, Math.min(1, Number(query.get("progress")) || 0)),
  playing: false,
  loop: query.get("loop") !== "0",
  speed: Math.max(0.25, Math.min(1.5, Number(query.get("speed")) || 1)),
  startHand: query.get("mirror") === "1" ? -1 : 1,
  trace: query.get("trace") !== "0",
  wireframe: query.get("wireframe") === "1",
  guides: query.get("guides") !== "0",
};

const scene = new T.Scene();
scene.background = new T.Color(0x05090d);
scene.fog = new T.Fog(0x05090d, 8.5, 17);

const camera = new T.PerspectiveCamera(38, 1, 0.05, 40);
camera.position.set(3.25, 2.15, 5.25);
camera.lookAt(-0.62, 0.92, 0);

const renderer = new T.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
// Motion review benefits more from a stable cadence than supersampling; the
// 1.25 cap keeps the single production rig at the browser's 60 FPS target.
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
renderer.domElement.setAttribute("aria-label", "Deterministic crossover and spin preview");
stage.appendChild(renderer.domElement);

scene.add(new T.HemisphereLight(0xc4eaff, 0x151117, 1.45));
const key = new T.DirectionalLight(0xffecdb, 3.25);
key.position.set(3.5, 7, 5.5);
key.castShadow = true;
key.shadow.mapSize.set(1536, 1536);
scene.add(key);
const rim = new T.SpotLight(0x62eaff, 16, 13, 0.58, 0.75, 1.2);
rim.position.set(-4.5, 5, -3.5);
rim.target.position.set(-0.5, 0.8, 0);
scene.add(rim, rim.target);

const floor = new T.Mesh(
  new T.PlaneGeometry(8.4, 6),
  new T.MeshStandardMaterial({ color: 0x18252b, roughness: 0.67, metalness: 0.04 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(-0.55, -0.006, 0);
floor.receiveShadow = true;
scene.add(floor);

const courtLines = new T.Group();
const courtLineMaterial = new T.LineBasicMaterial({
  color: 0x78d9e5,
  transparent: true,
  opacity: 0.38,
});
function line(points) {
  const geometry = new T.BufferGeometry().setFromPoints(points.map(([x, z]) => new T.Vector3(x, 0.008, z)));
  const result = new T.Line(geometry, courtLineMaterial);
  courtLines.add(result);
  return result;
}
line([[-4.55, -3], [3.65, -3], [3.65, 3], [-4.55, 3], [-4.55, -3]]);
line([[-4.55, -1.25], [-2.7, -1.25], [-2.7, 1.25], [-4.55, 1.25]]);
const arcPoints = [];
for (let i = 0; i <= 48; i++) {
  const angle = -Math.PI / 2 + (Math.PI * i) / 48;
  arcPoints.push([-4.55 + Math.cos(angle) * 2.65, Math.sin(angle) * 2.65]);
}
line(arcPoints);
scene.add(courtLines);

const guideRoot = new T.Group();
const grid = new T.GridHelper(8, 16, 0x3d9eaa, 0x21454c);
grid.position.y = 0.011;
grid.material.transparent = true;
grid.material.opacity = 0.22;
guideRoot.add(grid);
const heightMaterial = new T.LineBasicMaterial({ color: 0xffcc62, transparent: true, opacity: 0.62 });
lineHeightGuide();
function lineHeightGuide() {
  const points = [new T.Vector3(-1.65, 0, 0), new T.Vector3(-1.65, 2.2, 0)];
  const upright = new T.Line(new T.BufferGeometry().setFromPoints(points), heightMaterial);
  guideRoot.add(upright);
  for (let y = 0; y <= 2.2; y += 0.2) {
    const width = Math.abs(y - Math.round(y)) < 0.01 ? 0.16 : 0.08;
    guideRoot.add(new T.Line(
      new T.BufferGeometry().setFromPoints([
        new T.Vector3(-1.65 - width, y, 0),
        new T.Vector3(-1.65 + width, y, 0),
      ]),
      heightMaterial,
    ));
  }
}
scene.add(guideRoot);

const playerRoot = new T.Group();
scene.add(playerRoot);
const generatedTextures = [];
const harnessEngine = {
  T,
  _nextPlayerId: 1,
  playerRoot,
  generatedTextures,
  players: [],
  elapsed: 0,
  fixedAccumulator: 0,
  ball: { owner: null, position: new T.Vector3() },
  events: { emit() {} },
};

const player = new ProceduralPlayer(harnessEngine, {
  id: "dribble-lab-guard",
  name: "Motion Guard",
  team: "home",
  controlled: false,
  isAI: false,
  height: 1.9,
  jerseyNumber: 4,
  skinColor: 0x925c43,
  jerseyColor: 0x35d5ea,
  trimColor: 0x102d47,
  shoeColor: 0xf2f7f4,
  shoeStyleId: "nova-flight",
  position: new T.Vector3(),
});
harnessEngine.players.push(player);
player.marker.visible = false;

const ball = createBasketballMesh(T, 0.12, {
  anisotropy: renderer.capabilities.getMaxAnisotropy?.() || 1,
  textureRegistry: generatedTextures,
  style: "classic",
});
ball.castShadow = true;
scene.add(ball);

const traceMaterial = new T.LineBasicMaterial({
  color: 0xffca62,
  transparent: true,
  opacity: 0.88,
});
const pathTrace = new T.Line(new T.BufferGeometry(), traceMaterial);
scene.add(pathTrace);

const contactMarker = new T.Mesh(
  new T.RingGeometry(0.13, 0.155, 32),
  new T.MeshBasicMaterial({
    color: 0xffca62,
    transparent: true,
    opacity: 0.72,
    side: T.DoubleSide,
  }),
);
contactMarker.rotation.x = -Math.PI / 2;
contactMarker.position.y = 0.014;
scene.add(contactMarker);

function rebuildTrace() {
  const points = [];
  for (let i = 0; i <= 72; i++) {
    const sample = sampleFeaturedDribbleMove(state.move, i / 72, state.startHand);
    points.push(new T.Vector3(
      sample.pose.rootX + sample.ball.side,
      sample.ball.height,
      sample.pose.rootZ + sample.ball.forward,
    ));
  }
  pathTrace.geometry.dispose();
  pathTrace.geometry = new T.BufferGeometry().setFromPoints(points);
  pathTrace.visible = state.trace;
}

function resetRigPose(sample) {
  player.root.position.set(sample.pose.rootX, 0, sample.pose.rootZ);
  player.hips.position.set(0, player.baseHipHeight - sample.pose.crouch, 0);
  player.hips.rotation.set(-0.05, sample.pose.torsoYaw, sample.pose.torsoLean);

  const [rightLeg, leftLeg] = player.legs;
  rightLeg.hip.rotation.set(sample.pose.rightHip, 0, -0.04);
  leftLeg.hip.rotation.set(sample.pose.leftHip, 0, 0.04);
  rightLeg.knee.rotation.set(sample.pose.rightKnee, 0, 0);
  leftLeg.knee.rotation.set(sample.pose.leftKnee, 0, 0);

  const [rightArm, leftArm] = player.arms;
  const startArm = state.startHand > 0 ? rightArm : leftArm;
  const endArm = state.startHand > 0 ? leftArm : rightArm;
  const handPulse = Math.sin(Math.PI * sample.progress);
  rightArm.shoulder.rotation.set(-0.28, 0, -0.18);
  leftArm.shoulder.rotation.set(-0.28, 0, 0.18);
  rightArm.elbow.rotation.set(-0.34, 0, 0);
  leftArm.elbow.rotation.set(-0.34, 0, 0);

  startArm.shoulder.rotation.x = -0.48 - sample.hands.startWeight * 0.5 - handPulse * 0.18;
  endArm.shoulder.rotation.x = -0.48 - sample.hands.endWeight * 0.5 - handPulse * 0.18;
  startArm.shoulder.rotation.z = -startArm.side * (0.12 + handPulse * 0.28);
  endArm.shoulder.rotation.z = -endArm.side * (0.12 + handPulse * 0.28);
  startArm.elbow.rotation.x = -0.25 - sample.hands.startWeight * 0.32;
  endArm.elbow.rotation.x = -0.25 - sample.hands.endWeight * 0.32;

  if (sample.move === "spin") {
    player.hips.rotation.x = -0.08;
    startArm.shoulder.rotation.z -= startArm.side * 0.3;
    endArm.shoulder.rotation.z -= endArm.side * 0.22;
  }

  player.shortsRig?.update(1 / 60, {
    speedRatio: sample.move === "spin" ? 0.55 : 0.35,
    lateralSpeed: sample.pose.rootX,
    forwardSpeed: sample.pose.rootZ,
    defenseBlend: 0,
    airborneBlend: 0,
    leftHipPitch: leftLeg.hip.rotation.x,
    rightHipPitch: rightLeg.hip.rotation.x,
    leftHipYaw: 0,
    rightHipYaw: 0,
    leftHipRoll: leftLeg.hip.rotation.z,
    rightHipRoll: rightLeg.hip.rotation.z,
  });
  player.root.updateMatrixWorld(true);
}

function updateReadout(sample) {
  const frame = featuredDribbleFrameName(state.move, state.progress);
  const side = state.startHand > 0 ? "right" : "left";
  $("#dribble-progress").value = String(state.progress);
  $("#dribble-progress-value").textContent = state.progress.toFixed(3);
  $("#dribble-frame").textContent = frame.toUpperCase();
  $("#dribble-ball").textContent =
    `${ball.position.x.toFixed(3)}, ${ball.position.y.toFixed(3)}, ${ball.position.z.toFixed(3)}`;
  $("#dribble-start-hand").textContent = side.toUpperCase();
  $("#dribble-hand-weights").textContent =
    `${sample.hands.startWeight.toFixed(3)} / ${sample.hands.endWeight.toFixed(3)}`;
  $("#dribble-spin-angle").textContent = `${(sample.pose.spinAngle * 180 / Math.PI).toFixed(1)}°`;
  $("#dribble-clearance").textContent = `${sample.diagnostics.torsoClearance.toFixed(3)} m`;
  $("#dribble-capture-name").textContent = `dribble-${state.move}-${frame}-${side}.png`;
  $("#dribble-play").textContent = state.playing ? "PAUSE" : "PLAY";
  document.querySelectorAll("[data-move]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.move === state.move));
  });
  document.querySelectorAll("[data-frame]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.frame === frame));
  });
}

function applyState() {
  const sample = sampleFeaturedDribbleMove(state.move, state.progress, state.startHand);
  resetRigPose(sample);
  ball.position.set(
    sample.pose.rootX + sample.ball.side,
    sample.ball.height,
    sample.pose.rootZ + sample.ball.forward,
  );
  ball.rotation.set(
    state.progress * Math.PI * 4,
    state.startHand * state.progress * Math.PI * 2,
    -state.startHand * state.progress * Math.PI * 3,
  );
  contactMarker.position.x = ball.position.x;
  contactMarker.position.z = ball.position.z;
  contactMarker.scale.setScalar(0.75 + (1 - sample.ball.height) * 0.35);
  guideRoot.visible = state.guides;
  pathTrace.visible = state.trace;
  scene.traverse((node) => {
    if (!node.material || node === floor || node === pathTrace || node === contactMarker) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if ("wireframe" in material) material.wireframe = state.wireframe;
    }
  });
  updateReadout(sample);
  return sample;
}

function setMove(move) {
  if (!FEATURED_DRIBBLE_MOVES.includes(move)) return false;
  state.move = move;
  state.progress = 0;
  state.playing = false;
  rebuildTrace();
  applyState();
  return true;
}

function setProgress(progress) {
  const value = Number(progress);
  if (!Number.isFinite(value)) return false;
  state.progress = Math.max(0, Math.min(1, value));
  state.playing = false;
  applyState();
  return true;
}

function setNamedFrame(name) {
  const value = DRIBBLE_NAMED_FRAMES[state.move]?.[name];
  if (!Number.isFinite(value)) return false;
  return setProgress(value);
}

function saveCapture() {
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    link.download = $("#dribble-capture-name").textContent;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, "image/png");
}

function resize() {
  const width = Math.max(1, stage.clientWidth);
  const height = Math.max(1, stage.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

document.querySelectorAll("[data-move]").forEach((button) => {
  button.addEventListener("click", () => setMove(button.dataset.move));
});
document.querySelectorAll("[data-frame]").forEach((button) => {
  button.addEventListener("click", () => setNamedFrame(button.dataset.frame));
});
$("#dribble-play").addEventListener("click", () => {
  if (state.progress >= 1) state.progress = 0;
  state.playing = !state.playing;
  applyState();
});
$("#dribble-reset").addEventListener("click", () => setProgress(0));
$("#dribble-loop").addEventListener("change", (event) => {
  state.loop = event.target.checked;
});
$("#dribble-speed").addEventListener("input", (event) => {
  state.speed = Number(event.target.value);
  $("#dribble-speed-value").textContent = `${state.speed.toFixed(2)}×`;
});
$("#dribble-progress").addEventListener("input", (event) => setProgress(event.target.value));
$("#dribble-mirror").addEventListener("change", (event) => {
  state.startHand = event.target.checked ? -1 : 1;
  state.playing = false;
  rebuildTrace();
  applyState();
});
$("#dribble-trace").addEventListener("change", (event) => {
  state.trace = event.target.checked;
  applyState();
});
$("#dribble-wireframe").addEventListener("change", (event) => {
  state.wireframe = event.target.checked;
  applyState();
});
$("#dribble-guides").addEventListener("change", (event) => {
  state.guides = event.target.checked;
  applyState();
});
$("#dribble-capture").addEventListener("click", saveCapture);

$("#dribble-loop").checked = state.loop;
$("#dribble-speed").value = String(state.speed);
$("#dribble-speed-value").textContent = `${state.speed.toFixed(2)}×`;
$("#dribble-mirror").checked = state.startHand < 0;
$("#dribble-trace").checked = state.trace;
$("#dribble-wireframe").checked = state.wireframe;
$("#dribble-guides").checked = state.guides;

new ResizeObserver(resize).observe(stage);
resize();
rebuildTrace();
applyState();

let lastFrame = performance.now();
let metricStart = lastFrame;
let metricFrames = 0;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (state.playing) {
    const duration = DRIBBLE_MOVE_CONFIG[state.move].duration;
    state.progress += dt * state.speed / duration;
    if (state.progress >= 1) {
      if (state.loop) state.progress %= 1;
      else {
        state.progress = 1;
        state.playing = false;
      }
    }
    applyState();
  }
  renderer.render(scene, camera);
  metricFrames += 1;
  if (now - metricStart >= 500) {
    $("#dribble-fps").textContent = String(Math.round(metricFrames * 1000 / (now - metricStart)));
    $("#dribble-draws").textContent = String(renderer.info.render.calls);
    $("#dribble-tris").textContent = renderer.info.render.triangles.toLocaleString();
    $("#dribble-textures").textContent = String(renderer.info.memory.textures);
    metricStart = now;
    metricFrames = 0;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

globalThis.__NOVA_DRIBBLE_LAB__ = Object.freeze({
  setMove,
  setProgress,
  setNamedFrame,
  setPlaying(value) {
    state.playing = Boolean(value);
    applyState();
    return true;
  },
  setMirrored(value) {
    state.startHand = value ? -1 : 1;
    $("#dribble-mirror").checked = state.startHand < 0;
    rebuildTrace();
    applyState();
    return true;
  },
  getState() {
    const sample = sampleFeaturedDribbleMove(state.move, state.progress, state.startHand);
    return Object.freeze({
      move: state.move,
      progress: state.progress,
      namedFrame: featuredDribbleFrameName(state.move, state.progress),
      playing: state.playing,
      loop: state.loop,
      speed: state.speed,
      startHand: state.startHand,
      ball: Object.freeze({
        x: ball.position.x,
        y: ball.position.y,
        z: ball.position.z,
      }),
      pose: sample.pose,
      hands: sample.hands,
      diagnostics: sample.diagnostics,
      trace: state.trace,
      wireframe: state.wireframe,
      guides: state.guides,
      captureName: $("#dribble-capture-name").textContent,
      metrics: Object.freeze({
        fps: Number($("#dribble-fps").textContent),
        draws: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        textures: renderer.info.memory.textures,
      }),
      assetLoadStatus: "procedural-production-rig-ready",
    });
  },
});
