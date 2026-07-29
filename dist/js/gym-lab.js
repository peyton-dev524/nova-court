import { createSceneGroupLoader } from "./scene-group-loader.js?v=1.0";
import {
  createVenueGroups,
  normalizeVenueId,
  venueBudgetSnapshot,
  venueGroupIds,
  VENUE_QUALITY_BUDGETS,
  VENUE_VIEW_PRESETS,
} from "./venue-scenes.js?v=1.0";

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

let state = {
  venueId: normalizeVenueId(query.get("venue")),
  view: "baseline",
  quality: ["low", "medium", "high"].includes(query.get("quality")) ? query.get("quality") : "high",
  wireframe: query.get("wireframe") === "1",
  lights: query.get("lights") !== "0",
  guides: query.get("guides") !== "0",
};
state.view = VENUE_VIEW_PRESETS[state.venueId][query.get("view")] ? query.get("view") : "baseline";
let loader;
let frameSamples = [];
let lastFrame = performance.now();
let overlayTimer = 0;
guides.visible = state.guides;

function updateVenueCopy() {
  $("#gym-subtitle").textContent = state.venueId === "arena840"
    ? "CC0 840-seat small-arena study · three Wikideas1 reference angles"
    : "Montgomery-inspired compact shell · regulation 84 × 50 ft court";
}

function setCamera(view) {
  const views = VENUE_VIEW_PRESETS[state.venueId];
  state.view = views[view] ? view : "baseline";
  camera.position.set(...views[state.view].position);
  camera.lookAt(...views[state.view].target);
  camera.fov = state.view === "court-wide" ? 62 : 48;
  camera.updateProjectionMatrix();
  $("#gym-view").value = state.view;
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === state.view));
  updateCaptureName();
}

function updateCaptureName() {
  $("#gym-capture-name").textContent = `gym-${state.venueId}-${state.view}-${state.quality}.png`;
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
    const previousSceneId = previous.__sceneId || `gym-lab:${state.venueId}`;
    previous.releaseScene(previousSceneId, { dispose: forceDispose });
    world.clear();
  }
  const groups = createVenueGroups(T, state.venueId, state.quality);
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
  loader.__sceneId = `gym-lab:${state.venueId}`;
  const result = await loader.loadScene(loader.__sceneId, venueGroupIds(state.venueId));
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
    sceneId: `gym-lab:${state.venueId}`,
    venueId: state.venueId,
    view: state.view,
    quality: state.quality,
    phase: loader?.snapshot().phase || "idle",
    progress: loader?.snapshot().progress || 0,
    loadedIds: loader?.snapshot().loadedIds || [],
    visibleIds: loader?.snapshot().visibleIds || [],
    loadErrors: loader?.snapshot().errors || [],
    renderInfo: metrics(),
    budget: venueBudgetSnapshot(state.venueId, state.quality),
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
const groupIdForInput = (input) => `${state.venueId}-${input.dataset.groupSuffix}`;
document.querySelectorAll("[data-group-suffix]").forEach((input) =>
  input.addEventListener("change", () => setGroup(groupIdForInput(input), input.checked)));
$("#gym-venue").value = state.venueId;
$("#gym-venue").addEventListener("change", async (event) => {
  state.venueId = normalizeVenueId(event.target.value);
  updateVenueCopy();
  setCamera(state.view);
  updateCaptureName();
  await loadGym({ forceDispose: true });
});
$("#gym-wireframe").checked = state.wireframe;
$("#gym-wireframe").addEventListener("change", (event) => { state.wireframe = event.target.checked; wireframeScene(state.wireframe); });
$("#gym-lights").checked = state.lights;
$("#gym-lights").addEventListener("change", (event) => {
  state.lights = event.target.checked;
  ambient.visible = state.lights;
  key.visible = state.lights;
  setGroup(`${state.venueId}-lighting`, state.lights);
});
$("#gym-guides").checked = state.guides;
$("#gym-guides").addEventListener("change", (event) => { state.guides = event.target.checked; guides.visible = state.guides; });
$("#gym-reload").addEventListener("click", () => loadGym({ forceDispose: true }));
$("#gym-unload").addEventListener("click", () => {
  ["architecture", "bleachers", "signage", "lighting"].forEach((suffix) =>
    setGroup(`${state.venueId}-${suffix}`, false));
  document.querySelectorAll("[data-group-suffix]").forEach((input) => { input.checked = false; });
});
$("#gym-capture").addEventListener("click", capture);
window.addEventListener("resize", resize);
window.addEventListener("pagehide", () => {
  loader?.cancel();
  loader?.releaseScene(loader.__sceneId, { dispose: true });
  renderer.dispose();
}, { once: true });

window.__NOVA_GYM_LAB__ = {
  snapshot,
  setView: (view) => setCamera(view),
  setVenue: async (venueId) => {
    state.venueId = normalizeVenueId(venueId);
    $("#gym-venue").value = state.venueId;
    updateVenueCopy();
    setCamera(state.view);
    await loadGym({ forceDispose: true });
    return snapshot();
  },
  setQuality: async (quality) => {
    if (!VENUE_QUALITY_BUDGETS[state.venueId]?.[quality]) return false;
    state.quality = quality;
    $("#gym-quality").value = quality;
    updateCaptureName();
    await loadGym({ forceDispose: true });
    return true;
  },
  setGroup,
  reload: () => loadGym({ forceDispose: true }),
  unload: () => {
    loader?.releaseScene(loader.__sceneId, { dispose: true });
    world.clear();
    return snapshot();
  },
  capture,
  loadingOverlay: (active = true, progress = 0.45, phase = "optional") => {
    if (active) setLoading({ phase, progress, groupId: `${state.venueId}-architecture` });
    else $("#gym-loading").classList.add("is-hidden");
    return snapshot();
  },
};

resize();
updateVenueCopy();
setCamera(state.view);
await loadGym();
if (query.get("loading") === "1") {
  setLoading({ phase: "optional", progress: 0.72, groupId: `${state.venueId}-architecture` });
}
requestAnimationFrame(tick);
