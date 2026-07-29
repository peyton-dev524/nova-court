import { createSceneGroupLoader } from "./scene-group-loader.js?v=1.0";
import {
  createGymGroups,
  gymBudgetSnapshot,
  GYM_GROUP_IDS,
  GYM_QUALITY_BUDGETS,
} from "./gym-scene.js?v=1.0";

const T = globalThis.THREE;
if (!T) throw new Error("Stadium / Gym Lab requires THREE.");
const $ = (selector) => document.querySelector(selector);
const query = new URLSearchParams(location.search);
const stage = $("#gym-stage");
const scene = new T.Scene();
scene.background = new T.Color(0x090e12);
scene.fog = new T.Fog(0x090e12, 25, 62);
const camera = new T.PerspectiveCamera(48, 1, 0.1, 100);
const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.35));
stage.appendChild(renderer.domElement);

const world = new T.Group();
scene.add(world);
const ambient = new T.HemisphereLight(0xe8f2ff, 0x433326, 1.18);
const key = new T.DirectionalLight(0xffefcb, 1.85);
key.position.set(-7, 13, 5);
key.castShadow = true;
key.shadow.mapSize.set(1536, 1536);
scene.add(ambient, key);

const guides = new T.Group();
guides.add(new T.AxesHelper(3));
const heightGuide = new T.GridHelper(32, 32, 0x51e4f4, 0x26515b);
heightGuide.material.transparent = true;
heightGuide.material.opacity = 0.18;
guides.add(heightGuide);
scene.add(guides);

const VIEWS = Object.freeze({
  "reference-baseline": { position: [8.3, 4.25, 13.4], target: [0, 2.4, -8.6] },
  sideline: { position: [8.65, 4.15, 2.1], target: [0, 1.45, 0] },
  bleachers: { position: [-6.4, 2.35, -5.5], target: [0, 1.8, 14.1] },
  rafters: { position: [6.4, 2.25, 8.8], target: [0, 7.65, -1] },
  scoreboard: { position: [-6.8, 3.8, -5.4], target: [0, 4.9, 15.2] },
  "court-wide": { position: [8.4, 7.15, 13.6], target: [0, 0.2, 0] },
});
let state = {
  view: VIEWS[query.get("view")] ? query.get("view") : "reference-baseline",
  quality: GYM_QUALITY_BUDGETS[query.get("quality")] ? query.get("quality") : "high",
  wireframe: query.get("wireframe") === "1",
  lights: query.get("lights") !== "0",
  guides: query.get("guides") !== "0",
};
let loader;
let frameSamples = [];
let lastFrame = performance.now();
let overlayTimer = 0;
guides.visible = state.guides;

function setCamera(view) {
  state.view = VIEWS[view] ? view : "reference-baseline";
  camera.position.set(...VIEWS[state.view].position);
  camera.lookAt(...VIEWS[state.view].target);
  $("#gym-view").value = state.view;
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === state.view));
  updateCaptureName();
}

function updateCaptureName() {
  $("#gym-capture-name").textContent = `gym-${state.view}-${state.quality}.png`;
}

function setLoading({ phase, progress, groupId }) {
  const overlay = $("#gym-loading");
  clearTimeout(overlayTimer);
  overlay.classList.remove("is-hidden");
  $("#gym-loading-phase").textContent = String(phase || "shell").replaceAll("-", " ").toUpperCase();
  $("#gym-loading-group").textContent = groupId ? `Streaming ${groupId}…` : "Preparing compact gym…";
  $("#gym-loading-fill").style.width = `${Math.round(progress * 100)}%`;
  $("#gym-loading-progress").value = `${Math.round(progress * 100)}%`;
  $("#gym-phase").textContent = String(phase || "idle").toUpperCase();
  if (phase === "ready") overlayTimer = setTimeout(() => overlay.classList.add("is-hidden"), 120);
}

function wireframeScene(enabled) {
  world.traverse((node) => {
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.filter(Boolean).forEach((entry) => { if ("wireframe" in entry) entry.wireframe = enabled; });
  });
}

function attachLoadedGroups() {
  const snapshot = loader.snapshot();
  for (const id of snapshot.loadedIds) {
    // Loader owns lifecycle; its value is surfaced by the deterministic test hook.
    const definition = loader.__groups?.get(id);
    if (definition?.parent !== world) world.add(definition);
  }
  wireframeScene(state.wireframe);
}

async function loadGym({ forceDispose = false } = {}) {
  const previous = loader;
  if (previous) {
    previous.cancel();
    previous.releaseScene("gym-lab", { dispose: forceDispose });
    world.clear();
  }
  const groups = createGymGroups(T, state.quality);
  const values = new Map();
  const wrapped = groups.map((group) => ({
    ...group,
    createFallback: group.createFallback ? () => {
      const value = group.createFallback();
      values.set(group.id, value);
      world.add(value);
      return value;
    } : undefined,
    load: async () => {
      const value = await Promise.resolve(group.load());
      values.set(group.id, value);
      world.add(value);
      return value;
    },
  }));
  loader = createSceneGroupLoader({ groups: wrapped, onProgress: setLoading });
  loader.__groups = values;
  const result = await loader.loadScene("gym-lab", GYM_GROUP_IDS);
  attachLoadedGroups();
  return result;
}

function setGroup(id, visible) {
  loader?.setGroupVisible(id, visible);
  const value = loader?.__groups?.get(id);
  if (value) value.visible = visible;
}

function metrics() {
  return {
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  };
}

function snapshot() {
  return {
    sceneId: "gym-lab",
    view: state.view,
    quality: state.quality,
    phase: loader?.snapshot().phase || "idle",
    progress: loader?.snapshot().progress || 0,
    loadedIds: loader?.snapshot().loadedIds || [],
    visibleIds: loader?.snapshot().visibleIds || [],
    loadErrors: loader?.snapshot().errors || [],
    renderInfo: metrics(),
    budget: gymBudgetSnapshot(state.quality),
  };
}

function capture() {
  renderer.render(scene, camera);
  const link = document.createElement("a");
  link.download = $("#gym-capture-name").textContent;
  link.href = renderer.domElement.toDataURL("image/png");
  link.click();
  return link.download;
}

function resize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}

function tick(now) {
  const dt = Math.max(0.001, Math.min(0.1, (now - lastFrame) / 1000));
  lastFrame = now;
  frameSamples.push(1 / dt);
  if (frameSamples.length > 45) frameSamples.shift();
  renderer.render(scene, camera);
  const info = metrics();
  $("#gym-fps").textContent = String(Math.round(frameSamples.reduce((sum, value) => sum + value, 0) / frameSamples.length));
  $("#gym-calls").textContent = String(info.calls);
  $("#gym-triangles").textContent = info.triangles.toLocaleString();
  $("#gym-geometries").textContent = String(info.geometries);
  $("#gym-textures").textContent = String(info.textures);
  requestAnimationFrame(tick);
}

$("#gym-view").addEventListener("change", (event) => setCamera(event.target.value));
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setCamera(button.dataset.view)));
$("#gym-quality").value = state.quality;
$("#gym-quality").addEventListener("change", async (event) => {
  state.quality = event.target.value;
  updateCaptureName();
  await loadGym({ forceDispose: true });
});
document.querySelectorAll("[data-group]").forEach((input) => input.addEventListener("change", () => setGroup(input.dataset.group, input.checked)));
$("#gym-wireframe").checked = state.wireframe;
$("#gym-wireframe").addEventListener("change", (event) => { state.wireframe = event.target.checked; wireframeScene(state.wireframe); });
$("#gym-lights").checked = state.lights;
$("#gym-lights").addEventListener("change", (event) => {
  state.lights = event.target.checked;
  ambient.visible = state.lights;
  key.visible = state.lights;
  setGroup("gym-lighting", state.lights);
});
$("#gym-guides").checked = state.guides;
$("#gym-guides").addEventListener("change", (event) => { state.guides = event.target.checked; guides.visible = state.guides; });
$("#gym-reload").addEventListener("click", () => loadGym({ forceDispose: true }));
$("#gym-unload").addEventListener("click", () => {
  ["gym-architecture", "gym-bleachers", "gym-signage", "gym-lighting"].forEach((id) => setGroup(id, false));
  document.querySelectorAll("[data-group]").forEach((input) => { input.checked = false; });
});
$("#gym-capture").addEventListener("click", capture);
window.addEventListener("resize", resize);
window.addEventListener("pagehide", () => {
  loader?.cancel();
  loader?.releaseScene("gym-lab", { dispose: true });
  renderer.dispose();
}, { once: true });

window.__NOVA_GYM_LAB__ = {
  snapshot,
  setView: (view) => setCamera(view),
  setQuality: async (quality) => {
    if (!GYM_QUALITY_BUDGETS[quality]) return false;
    state.quality = quality;
    $("#gym-quality").value = quality;
    updateCaptureName();
    await loadGym({ forceDispose: true });
    return true;
  },
  setGroup,
  reload: () => loadGym({ forceDispose: true }),
  unload: () => {
    loader?.releaseScene("gym-lab", { dispose: true });
    world.clear();
    return snapshot();
  },
  capture,
  loadingOverlay: (active = true, progress = 0.45, phase = "optional") => {
    if (active) setLoading({ phase, progress, groupId: "gym-architecture" });
    else $("#gym-loading").classList.add("is-hidden");
    return snapshot();
  },
};

resize();
setCamera(state.view);
await loadGym();
if (query.get("loading") === "1") {
  setLoading({ phase: "optional", progress: 0.72, groupId: "gym-architecture" });
}
requestAnimationFrame(tick);
